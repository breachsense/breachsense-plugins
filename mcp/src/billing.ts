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
 * Cost of a search request. A count (?count / ?size) is free on every endpoint: each handler
 * answers it before billing (breachsense/code fleet/commons/usr/local/openresty/nginx/conf/*.lua,
 * checked 2026-11-25; creds made explicit in breachsense/code PR #392).
 */
export function searchBilling(_path: string, params: Params): AttemptCost {
  return "count" in params ? "none" : BILLING.search;
}
