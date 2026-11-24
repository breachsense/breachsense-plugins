import { isValidYmd, ymdToDate } from "./validate";

export function parseDate(v: unknown): Date | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v < 1e8) return isValidYmd(String(v)) ? ymdToDate(String(v)) : null;
    if (v < 1e11) return new Date(v * 1000);
    return new Date(v);
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^\d{8}$/.test(s)) return isValidYmd(s) ? ymdToDate(s) : null;
  if (/^\d{9,10}$/.test(s)) return new Date(+s * 1000);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}
