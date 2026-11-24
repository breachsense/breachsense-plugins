import type { AttemptCost } from "./client";

/**
 * What a successful (2xx) response costs, per request class.
 * "unknown" until verified against the live audit log (Task 10).
 */
export const BILLING: Record<"search" | "download" | "remaining" | "account", AttemptCost> = {
  search: "billed",
  download: "billed",
  remaining: "unknown",
  account: "unknown",
};
