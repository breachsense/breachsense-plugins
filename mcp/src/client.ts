import type { Params } from "./endpoints/types";
import { Throttle } from "./throttle";
import { VERSION } from "./version";

export type Op = "read" | "write";
export type AttemptCost = "none" | "billed" | "unknown";
export interface Cost { used: number; unknown: number }

export type Failure =
  | { kind: "not_sent"; code: string }
  | { kind: "no_response"; reason: "timeout" | "reset" }
  | { kind: "http"; status: number; json: unknown; html: boolean; text: string; retryAfterMs: number | null };

export interface Success {
  ok: true; status: number; json: unknown; text: string; bytes: Uint8Array; contentType: string; partial: boolean; cost: Cost;
}
export interface Fail { ok: false; failure: Failure; cost: Cost; mayHaveTakenEffect: boolean; retryAt: Date | null }
export type ClientResult = Success | Fail;

export interface RequestSpec { path: string; params: Params; op: Op; billing: AttemptCost }

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

type Attempt =
  | { kind: "response"; status: number; json: unknown; text: string; bytes: Uint8Array; contentType: string; html: boolean; retryAfterMs: number | null }
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

  constructor(private readonly opts: ClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.rateDeadlineMs = opts.rateDeadlineMs ?? 20_000;
    this.throttle = new Throttle(opts.throttleMs ?? 1000, this.now, this.sleep);
    this.ua = opts.userAgent ?? USER_AGENT;
  }

  private async attempt(url: string): Promise<Attempt> {
    try {
      const res = await this.fetchImpl(url, {
        headers: { lic: this.opts.key, "user-agent": this.ua, accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "manual",
      });
      const bytes = new Uint8Array(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") ?? "";
      const text = new TextDecoder().decode(bytes);
      let json: unknown = undefined;
      try { json = JSON.parse(text); } catch { /* not JSON */ }
      const html = /text\/html/i.test(contentType) || /^\s*<(!doctype|html)/i.test(text);
      return { kind: "response", status: res.status, json, text, bytes, contentType, html, retryAfterMs: retryAfterMs(res.headers.get("retry-after"), this.now()) };
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

    for (;;) {
      await this.throttle.wait();
      const a = await this.attempt(url);

      if (a.kind === "response" && a.status >= 200 && a.status < 300 && !a.html) {
        if (!free) {
          if (spec.billing === "billed") cost.used++;
          else if (spec.billing === "unknown") cost.unknown++;
        }
        return { ok: true, status: a.status, json: a.json, text: a.text, bytes: a.bytes, contentType: a.contentType, partial: a.status === 206, cost };
      }

      if (a.kind !== "not_sent" && !free) cost.unknown++;
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
}
