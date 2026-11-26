import { z } from "zod";

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const EMAIL_RE = /^[^\s@,:]+@[^\s@,:]+\.[^\s@,:]+$/;

export const domain = z.string().trim().toLowerCase().regex(DOMAIN_RE, "must be a domain such as acme.com");
export const term = z.string().trim().min(1).max(256);
export const page = z.number().int().min(1).max(10000).optional();

export function isValidYmd(s: string): boolean {
  if (!/^\d{8}$/.test(s)) return false;
  const y = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
export function ymdToDate(s: string): Date {
  return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
}
export const ymd = z.string().trim().refine(isValidYmd, "must be a date in YYYYMMDD format");
export const dateRange = z.object({ from: ymd, to: ymd });

export function rangeError(from: string, to: string): string | null {
  const days = Math.round((ymdToDate(to).getTime() - ymdToDate(from).getTime()) / 86_400_000);
  if (days < 0) return "date_range ends before it starts.";
  if (days > 30) return "date_range can cover at most 31 days.";
  return null;
}

export function isHttpsUrl(s: string): boolean {
  try { return new URL(s).protocol === "https:"; } catch { return false; }
}
