import { isDailyLimit, type Fail } from "./client";
import { redact } from "./redact";

export interface ErrorContext { keySource: string; secrets: string[] }

export const MAYBE_APPLIED = " The change may already have been applied. Run get_monitoring_setup to check before trying again.";

export function providerMessage(json: unknown, secrets: string[]): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const m = typeof o.message === "string" ? o.message : typeof o.error === "string" ? o.error : null;
  if (!m) return null;
  return redact(m, secrets).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 200).trim();
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function describeFailure(r: Fail, ctx: ErrorContext): string {
  const f = r.failure;
  const tail = r.mayHaveTakenEffect ? MAYBE_APPLIED : "";
  if (f.kind === "not_sent" && f.code === "INVALID_REQUEST") {
    return "The request could not be built (invalid API base URL, port or license key format), so nothing was sent. Check BREACHSENSE_API_BASE and the license key.";
  }
  if (f.kind === "not_sent") return `Couldn't reach api.breachsense.com (${f.code}). Check the internet connection or proxy settings.`;
  if (f.kind === "no_response") {
    return (f.reason === "timeout" ? "Breachsense didn't respond in time." : "The connection to Breachsense dropped before a reply arrived.") + tail;
  }
  if (/error code:\s*1010/i.test(f.text)) return "Breachsense blocked this request at its edge.";
  if (f.html) return `Breachsense returned an unexpected response (HTTP ${f.status}).` + tail;

  const msg = providerMessage(f.json, ctx.secrets) ?? "";
  const o = (f.json && typeof f.json === "object" ? f.json : {}) as Record<string, unknown>;

  if (f.status === 401 || (f.status === 403 && /valid license|invalid license|expired/i.test(msg))) {
    return `Breachsense rejected the license key read from ${ctx.keySource}. Replace the key there or set BREACHSENSE_API_KEY, then restart the server.`;
  }
  if (f.status === 403 && /monthly query limit/i.test(msg)) {
    const limit = num(o.limit), used = num(o.used);
    const nums = limit !== null && used !== null ? ` (${used} of ${limit} used)` : "";
    return `This license has reached its monthly query limit${nums}. Contact support@breachsense.com to raise it.`;
  }
  if (f.status === 403 && /plan does not include/i.test(msg)) return "This feature isn't included in the license's plan. Contact support@breachsense.com to add it.";
  if (f.status === 403 && /unmonitored asset/i.test(msg)) return "That asset isn't on the watchlist. Add it with manage_watchlist first.";
  if (f.status === 429 && isDailyLimit(f.json)) {
    const h = num(o.reset_in_hours);
    return `The daily limit for this action has been reached.${h !== null ? ` It resets in ${h} ${h === 1 ? "hour" : "hours"}.` : ""}`;
  }
  if (f.status === 429) return `Breachsense is rate limiting requests.${r.retryAt ? ` Try again after ${r.retryAt.toISOString()}.` : " Try again shortly."}`;
  if (f.status === 400) return `Breachsense rejected the request${msg ? `: ${msg}` : "."}`;
  if (f.status === 422) return `Breachsense couldn't apply this change${msg ? `: ${msg}` : "."}`;
  if (f.status >= 500) return "Breachsense had a temporary server problem. Try again shortly; if it keeps happening, contact support@breachsense.com." + tail;
  return `Breachsense returned HTTP ${f.status}${msg ? `: ${msg}` : "."}` + tail;
}

export function shortFailure(r: Fail, ctx: ErrorContext): string {
  const f = r.failure;
  if (f.kind === "no_response") return f.reason === "timeout" ? "timed out" : "lost its connection before replying";
  if (f.kind === "not_sent" && f.code === "INVALID_REQUEST") return "could not be sent (invalid request)";
  if (f.kind === "not_sent") return "couldn't be reached";
  return `returned an error: ${describeFailure(r, ctx)}`;
}
