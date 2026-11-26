import { describe, expect, it } from "vitest";
import { loadLicense, parseLicenseFile, resolveBaseUrl, DEFAULT_BASE_URL } from "../src/config";

const KEY = "0123456789abcdef0123";

describe("parseLicenseFile", () => {
  it("reads a bare key", () => expect(parseLicenseFile(`${KEY}\n`)).toBe(KEY));
  it("reads a key: prefix", () => expect(parseLicenseFile(`key: ${KEY}`)).toBe(KEY));
  it("reads a fenced key", () => expect(parseLicenseFile("# License\n```\n" + KEY + "\n```\n")).toBe(KEY));
  it("returns null when nothing looks like a key", () => expect(parseLicenseFile("hello world")).toBeNull());
});

describe("loadLicense", () => {
  const noFiles = () => { throw new Error("ENOENT"); };
  it("prefers the environment variable", () => {
    expect(loadLicense({ BREACHSENSE_API_KEY: ` ${KEY} ` }, "/home/u", noFiles))
      .toEqual({ key: KEY, source: "the BREACHSENSE_API_KEY environment variable" });
  });
  it("falls back to ~/.config then ~/.claude license files", () => {
    const files: Record<string, string> = { "/home/u/.claude/breachsense/license.md": `key: ${KEY}` };
    const read = (p: string) => { if (p in files) return files[p]; throw new Error("ENOENT"); };
    expect(loadLicense({}, "/home/u", read)).toEqual({ key: KEY, source: "/home/u/.claude/breachsense/license.md" });
  });
  it("returns null when no key exists anywhere", () => expect(loadLicense({}, "/home/u", noFiles)).toBeNull());
});

describe("resolveBaseUrl", () => {
  it("defaults to the production host", () => expect(resolveBaseUrl({})).toBe(DEFAULT_BASE_URL));
  it("accepts an https override", () => expect(resolveBaseUrl({ BREACHSENSE_API_BASE: "https://staging.example.com/" })).toBe("https://staging.example.com"));
  it("rejects a non-https override", () => expect(() => resolveBaseUrl({ BREACHSENSE_API_BASE: "http://evil.example" })).toThrow(/https/));
});
