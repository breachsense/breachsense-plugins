import { describe, expect, it } from "vitest";
import { redact } from "../src/redact";

describe("redact", () => {
  it("removes every occurrence of a secret", () => {
    expect(redact("key abcdef123456 and abcdef123456", ["abcdef123456"])).toBe("key [redacted] and [redacted]");
  });
  it("ignores empty or very short secrets so it cannot mangle normal text", () => {
    expect(redact("a b c", ["", "a"])).toBe("a b c");
  });
  it("removes basic-auth credentials embedded in URLs", () => {
    expect(redact("posted to https://bob:s3cret@hooks.acme.com/x", [])).toBe("posted to https://[redacted]@hooks.acme.com/x");
  });
  it("removes creds= values", () => {
    expect(redact("action=add&creds=bob:s3cret&x=1", [])).toBe("action=add&creds=[redacted]&x=1");
  });
  it("removes a basic-auth password containing @ and an empty username", () => {
    expect(redact("https://u:p@ss@host/x", [])).toBe("https://[redacted]@host/x");
    expect(redact("https://:pass@host", [])).toBe("https://[redacted]@host");
    expect(redact("see https://acme.com/a@b and http://u:p@h?q=1", [])).toBe("see https://acme.com/a@b and http://[redacted]@h?q=1");
  });
});
