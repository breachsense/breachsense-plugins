import { describe, expect, it } from "vitest";
import { domain, isValidYmd, rangeError, term } from "../src/validate";
import { daysBetween, formatDate, parseDate } from "../src/dates";

describe("validate", () => {
  it("accepts and lowercases domains", () => expect(domain.parse(" Acme.COM ")).toBe("acme.com"));
  it("rejects non-domains", () => {
    expect(domain.safeParse("acme").success).toBe(false);
    expect(domain.safeParse("acme.com&p=2").success).toBe(false);
  });
  it("bounds search terms", () => {
    expect(term.safeParse("").success).toBe(false);
    expect(term.safeParse("x".repeat(257)).success).toBe(false);
  });
  it("checks real calendar dates", () => {
    expect(isValidYmd("20261124")).toBe(true);
    expect(isValidYmd("20260230")).toBe(false);
    expect(isValidYmd("2026-11-24")).toBe(false);
  });
  it("limits date ranges to 31 days", () => {
    expect(rangeError("20261001", "20261031")).toBeNull();
    expect(rangeError("20261001", "20261101")).toMatch(/31 days/);
    expect(rangeError("20261010", "20261001")).toMatch(/before/);
  });
});

describe("dates", () => {
  it("parses YYYYMMDD strings and numbers, unixtime and ISO", () => {
    expect(parseDate("19700101")).toBeNull();
    expect(parseDate(19700101)).toBeNull();
    expect(parseDate(0)).toBeNull();
    expect(parseDate("0")).toBeNull();
    expect(parseDate("1970-01-01")).toBeNull();
    expect(parseDate("1989-12-31")).toBeNull();
    expect(formatDate(parseDate("19900101")!)).toBe("1990-01-01");
    expect(formatDate(parseDate("20260102")!)).toBe("2026-01-02");
    expect(formatDate(parseDate(20260102)!)).toBe("2026-01-02");
    expect(formatDate(parseDate(1767312000)!)).toBe("2026-01-02");
    expect(formatDate(parseDate("1767312000")!)).toBe("2026-01-02");
    expect(formatDate(parseDate("2026-01-02")!)).toBe("2026-01-02");
  });
  it("returns null for junk", () => {
    expect(parseDate("soon")).toBeNull();
    expect(parseDate(null)).toBeNull();
  });
  it("counts whole days", () => expect(daysBetween(parseDate("20261101")!, parseDate("20261124")!)).toBe(23));
});
