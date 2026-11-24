import { z } from "zod";
import { dateRange, domain, page, rangeError, ymd } from "../validate";
import type { Built, Params } from "./types";

export const commonShape = {
  since: ymd.optional().describe("Only records found on or after this date (YYYYMMDD)."),
  count_only: z.boolean().optional().describe("Return only the number of matches, no rows. Free. Use it first for large domains."),
  page: page.describe("Page number, starting at 1 (the default). Each page costs 1 query; fetch more pages only when the user asks."),
};

export interface CommonArgs { since?: string; count_only?: boolean; page?: number }

export function commonParams(a: CommonArgs): Params {
  const p: Params = {};
  if (a.since) p.date = a.since;
  if (a.count_only) p.count = true;
  if (a.page && a.page > 1) p.p = String(a.page);
  return p;
}

export const scopeField = z.enum(["all", "employees"]).optional()
  .describe("For a domain: 'all' (default) matches anyone logging in to the site, including customers; 'employees' matches only usernames at the domain.");

export function scopedTerm(q: string, scope?: "all" | "employees"): string {
  return scope === "employees" && !q.includes("@") ? `@${q}` : q;
}

export const domainOrRangeShape = {
  domain: domain.optional().describe("Victim domain, exact match (subdomains are not rolled up)."),
  date_range: dateRange.optional().describe("List everything indexed between two dates (YYYYMMDD), at most 31 days."),
};

export function rangeOrDomain(a: { domain?: string; date_range?: { from: string; to: string } }): Built | { error: string } {
  if (a.domain && a.date_range) return { error: "Give either domain or date_range, not both." };
  if (a.domain) return { params: { s: a.domain }, query: a.domain };
  if (a.date_range) {
    const { from, to } = a.date_range;
    const err = rangeError(from, to);
    if (err) return { error: err };
    return { params: { range: `${from}-${to}` }, query: `${from} to ${to}` };
  }
  return { error: "Give a domain or a date_range." };
}
