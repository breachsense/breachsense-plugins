import type { AttemptCost } from "./client";

/**
 * What a successful (2xx) response costs, per request class.
 * Verified 2026-11-24 against the live audit log and the Remaining counter: /stealer?r and every
 * /account action (including 4xx replies) are not counted. Search count_only billing is unproven,
 * so search stays "billed".
 */
export const BILLING: Record<"search" | "download" | "remaining" | "account", AttemptCost> = {
  search: "billed",
  download: "billed",
  remaining: "none",
  account: "none",
};
