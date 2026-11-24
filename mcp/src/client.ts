import type { Params } from "./endpoints/types";
import { Throttle } from "./throttle";
import { VERSION } from "./version";

export type Op = "read" | "write";
export type AttemptCost = "none" | "billed" | "unknown";
export interface Cost { used: number; unknown: number }

export type Failure =
  | { kind: "not_sent"; code: string }
  | { kind: "no_response"; reason: "timeout" | "reset" }
  | { kind: "http"; status: number; json: unknown; html: boolean; text: string; retryAfterMs: number | null }
  /** The body was bigger than we are willing to hold in memory; reading stopped at the cap. */
  | { kind: "too_large"; status: number; limitBytes: number }
  /** The storage file is over the download cap; reading stopped. `bytes` is the declared size, null when unknown. */
  | { kind: "storage_too_large"; url: string; bytes: number | null; limitBytes: number }
  /** A download redirect pointed somewhere other than the allowed storage hosts; it was not followed. */
  | { kind: "redirect_refused" }
  /** The storage server a download was redirected to did not return the file. */
  | { kind: "storage"; status: number | null };

export interface Success {
  ok: true; status: number; json: unknown; text: string; bytes: Uint8Array; contentType: string; partial: boolean; cost: Cost;
}
export interface Fail { ok: false; failure: Failure; cost: Cost; mayHaveTakenEffect: boolean; retryAt: Date | null }
export type ClientResult = Success | Fail;

export interface RequestSpec {
  path: string; params: Params; op: Op; billing: AttemptCost;
  /** Document download only: follow one 3xx to an allowlisted storage host, without the license key. */
  followDownloadRedirect?: boolean;
}

export interface ClientOptions {
  key: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  rateDeadlineMs?: number;
  throttleMs?: number;
  userAgent?: string;
  /** Hosts a download redirect may go to. Default: https and *.amazonaws.com or *.linodeobjects.com (presigned URLs). */
  downloadHostAllowed?: (url: URL) => boolean;
  maxBodyBytes?: number;
  maxDownloadBytes?: number;
}

export const MAX_BODY_BYTES = 20 * 1024 * 1024;
export const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

export function downloadHostAllowedDefault(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const h = url.hostname.toLowerCase();
  return h.endsWith(".amazonaws.com") || h.endsWith(".linodeobjects.com");
}

export const USER_AGENT = `breachsense-mcp/${VERSION}`;
const BACKOFF_MS = [1000, 2000, 4000];

// Errors raised before the request could reach the server.
const NOT_SENT_CODES = new Set([
  "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT",
  "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID",
]);

export function buildUrl(base: string, path: string, params: Params): string {
  const qs = Object.entries(params)
    .map(([k, v]) => (v === true ? encodeURIComponent(k) : `${encodeURIComponent(k)}=${encodeURIComponent(v)}`))
    .join("&");
  return `${base.replace(/\/+$/, "")}${path}${qs ? `?${qs}` : ""}`;
}

export function isFreeTerm(params: Params): boolean {
  const s = typeof params.s === "string" ? params.s.trim() : "";
  return /(^|[.@])(example|test)\.com$/i.test(s);
}

export function isDailyLimit(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const o = json as Record<string, unknown>;
  if ("reset_in_hours" in o) return true;
  return /\b(daily|per day|today)\b/i.test(`${o.message ?? ""} ${o.error ?? ""}`);
}

function errorCode(err: unknown): string | null {
  let e: unknown = err;
  for (let i = 0; i < 5 && e && typeof e === "object"; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

// Thrown by fetch before any I/O: bad header value, unparseable URL, blocked port.
function isInvalidRequest(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false;
  const cause = (err as { cause?: unknown }).cause;
  if (cause === undefined) return true;
  const c = cause as { code?: unknown; message?: unknown };
  return c.code === "ERR_INVALID_URL" || c.message === "bad port";
}

function retryAfterMs(h: string | null, now: number): number | null {
  if (!h) return null;
  if (/^\d+$/.test(h.trim())) return Number(h) * 1000;
  const t = Date.parse(h);
  return Number.isNaN(t) ? null : Math.max(0, t - now);
}

/** Read at most `max` bytes of the body; null when it is larger (the rest is discarded). */
async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) { await res.body?.cancel().catch(() => {}); return null; }
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

type Attempt =
  | { kind: "response"; status: number; json: unknown; text: string; bytes: Uint8Array; contentType: string; html: boolean; retryAfterMs: number | null; location: string | null }
  | { kind: "too_large"; status: number; declared: number | null }
  | { kind: "not_sent"; code: string }
  | { kind: "no_response"; reason: "timeout" | "reset" };

export class BreachsenseClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly rateDeadlineMs: number;
  private readonly throttle: Throttle;
  private readonly ua: string;
  private readonly downloadHostAllowed: (url: URL) => boolean;
  private readonly maxBodyBytes: number;
  private readonly maxDownloadBytes: number;

  constructor(private readonly opts: ClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.rateDeadlineMs = opts.rateDeadlineMs ?? 20_000;
    this.throttle = new Throttle(opts.throttleMs ?? 1000, this.now, this.sleep);
    this.ua = opts.userAgent ?? USER_AGENT;
    this.downloadHostAllowed = opts.downloadHostAllowed ?? downloadHostAllowedDefault;
    this.maxBodyBytes = opts.maxBodyBytes ?? MAX_BODY_BYTES;
    this.maxDownloadBytes = opts.maxDownloadBytes ?? MAX_DOWNLOAD_BYTES;
  }

  /**
   * One HTTP GET, never following redirects. The license key is only added for the configured
   * Breachsense base URL; the storage leg of a download gets just the User-Agent.
   */
  private async attempt(url: string, withKey: boolean, maxBytes: number): Promise<Attempt> {
    try {
      const headers: Record<string, string> = withKey
        ? { lic: this.opts.key, "user-agent": this.ua, accept: "application/json" }
        : { "user-agent": this.ua };
      const res = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(this.timeoutMs), redirect: "manual" });
      const bytes = await readCapped(res, maxBytes);
      if (!bytes) {
        const d = res.headers.get("content-length");
        const declared = d !== null && d.trim() !== "" && Number.isFinite(Number(d)) ? Number(d) : null;
        return { kind: "too_large", status: res.status, declared };
      }
      const contentType = res.headers.get("content-type") ?? "";
      const text = new TextDecoder().decode(bytes);
      let json: unknown = undefined;
      try { json = JSON.parse(text); } catch { /* not JSON */ }
      const html = /text\/html/i.test(contentType) || /^\s*<(!doctype|html)/i.test(text);
      return { kind: "response", status: res.status, json, text, bytes, contentType, html, retryAfterMs: retryAfterMs(res.headers.get("retry-after"), this.now()), location: res.headers.get("location") };
    } catch (err) {
      if (isInvalidRequest(err)) return { kind: "not_sent", code: "INVALID_REQUEST" };
      const code = errorCode(err);
      if (code && NOT_SENT_CODES.has(code)) return { kind: "not_sent", code };
      const name = (err as { name?: string })?.name;
      return { kind: "no_response", reason: name === "TimeoutError" || name === "AbortError" ? "timeout" : "reset" };
    }
  }

  async request(spec: RequestSpec): Promise<ClientResult> {
    const url = buildUrl(this.opts.baseUrl, spec.path, spec.params);
    const free = isFreeTerm(spec.params);
    const cost: Cost = { used: 0, unknown: 0 };
    const started = this.now();
    let plainRetryUsed = false;
    let rateRetries = 0;
    const maxBytes = spec.followDownloadRedirect ? this.maxDownloadBytes : this.maxBodyBytes;
    const uncounted = spec.billing === "none";
    const addBilling = () => {
      if (free) return;
      if (spec.billing === "billed") cost.used++;
      else if (spec.billing === "unknown") cost.unknown++;
    };

    for (;;) {
      await this.throttle.wait();
      const a = await this.attempt(url, true, maxBytes);

      if (a.kind === "too_large") {
        const ok2xx = a.status >= 200 && a.status < 300;
        if (ok2xx) addBilling(); else if (!free && !uncounted) cost.unknown++;
        const failure: Failure = { kind: "too_large", status: a.status, limitBytes: maxBytes };
        return { ok: false, failure, cost, mayHaveTakenEffect: spec.op === "write", retryAt: null };
      }

      if (a.kind === "response" && a.status >= 200 && a.status < 300 && !a.html) {
        addBilling();
        return { ok: true, status: a.status, json: a.json, text: a.text, bytes: a.bytes, contentType: a.contentType, partial: a.status === 206, cost };
      }

      if (spec.followDownloadRedirect && a.kind === "response" && a.status >= 300 && a.status < 400) {
        // Breachsense counts the download before redirecting to storage.
        addBilling();
        return this.fetchFromStorage(a.location, cost);
      }

      // An uncounted endpoint (billing "none") costs nothing for any HTTP reply; no reply stays unknown.
      const uncountedReply = spec.billing === "none" && a.kind === "response";
      if (a.kind !== "not_sent" && !free && !uncountedReply) cost.unknown++;
      const failure: Failure = a.kind === "response"
        ? { kind: "http", status: a.status, json: a.json, html: a.html, text: a.text, retryAfterMs: a.retryAfterMs }
        : a;

      if (failure.kind === "http" && failure.status === 429 && !isDailyLimit(failure.json)) {
        const wait = failure.retryAfterMs ?? BACKOFF_MS[Math.min(rateRetries, BACKOFF_MS.length - 1)];
        if (rateRetries < BACKOFF_MS.length && this.now() - started + wait <= this.rateDeadlineMs) {
          rateRetries++;
          await this.sleep(wait);
          continue;
        }
        return { ok: false, failure, cost, mayHaveTakenEffect: false, retryAt: new Date(this.now() + wait) };
      }

      const serverError = failure.kind === "http" && failure.status >= 500;
      const ambiguous = failure.kind === "no_response" || serverError;
      // Delivered but unusable (redirect, HTML on 2xx): never retried, but a write may have landed.
      const deliveredUnusable = failure.kind === "http" && (failure.status < 500 && (failure.status < 400 || failure.html));
      const retryable = (failure.kind === "not_sent" && failure.code !== "INVALID_REQUEST") || (spec.op === "read" && ambiguous);
      if (retryable && !plainRetryUsed) { plainRetryUsed = true; continue; }

      return { ok: false, failure, cost, mayHaveTakenEffect: spec.op === "write" && (ambiguous || deliveredUnusable), retryAt: null };
    }
  }

  /** Second leg of a download: one GET to the storage URL, no key, no redirects, no HTML sniffing. */
  private async fetchFromStorage(location: string | null, cost: Cost): Promise<ClientResult> {
    const fail = (failure: Failure): Fail => ({ ok: false, failure, cost, mayHaveTakenEffect: false, retryAt: null });
    let target: URL;
    try { target = new URL(location ?? ""); } catch { return fail({ kind: "redirect_refused" }); }
    if (!this.downloadHostAllowed(target)) return fail({ kind: "redirect_refused" });
    const b = await this.attempt(target.href, false, this.maxDownloadBytes);
    if (b.kind === "too_large") return fail({ kind: "storage_too_large", url: target.href, bytes: b.declared, limitBytes: this.maxDownloadBytes });
    if (b.kind !== "response") return fail({ kind: "storage", status: null });
    if (b.status < 200 || b.status >= 300) return fail({ kind: "storage", status: b.status });
    return { ok: true, status: b.status, json: b.json, text: b.text, bytes: b.bytes, contentType: b.contentType, partial: false, cost };
  }
}
