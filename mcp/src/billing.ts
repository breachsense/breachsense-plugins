import type { AttemptCost } from "./client";
import type { Params } from "./endpoints/types";

/**
 * What a successful (2xx) response costs, per request class.
 * Verified 2026-11-24 against the live audit log and the Remaining counter: /stealer?r and every
 * /account action (including 4xx replies) are not counted. Searches and downloads are counted.
 */
export const BILLING: Record<"search" | "download" | "remaining" | "account", AttemptCost> = {
  search: "billed",
  download: "billed",
  remaining: "none",
  account: "none",
};

/**
 * Endpoints whose ?count is billed like a row search. Every other handler answers a count
 * and returns before its increment_usage_async call; creds.lua bills the count
 * (breachsense/code fleet/commons/usr/local/openresty/nginx/conf/*.lua, checked 2026-11-25).
 */
const BILLED_COUNT_PATHS = new Set(["/creds"]);

/** Cost of a search request: count_only is free except where the API bills it. */
export function searchBilling(path: string, params: Params): AttemptCost {
  if ("count" in params && !BILLED_COUNT_PATHS.has(path)) return "none";
  return BILLING.search;
}
