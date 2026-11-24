import { readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_BASE_URL = "https://api.breachsense.com";

export interface License { key: string; source: string }

export const SETUP_MESSAGE =
  "No Breachsense license key found, so no query was sent. Set the BREACHSENSE_API_KEY environment variable, " +
  "or create ~/.config/breachsense/license.md containing only the key, then restart this MCP server. " +
  "In Claude Desktop, enter the key in the Breachsense extension settings.";

const KEY_RE = /^[A-Za-z0-9_-]{16,}$/;

export function parseLicenseFile(text: string): string | null {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("```") || line.startsWith("#")) continue;
    const v = line.replace(/^key\s*:\s*/i, "").replace(/^[`'"]+|[`'"]+$/g, "").trim();
    if (KEY_RE.test(v)) return v;
  }
  return null;
}

export function loadLicense(
  env: NodeJS.ProcessEnv,
  home: string,
  read: (path: string) => string = (p) => readFileSync(p, "utf8"),
): License | null {
  const fromEnv = env.BREACHSENSE_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: "the BREACHSENSE_API_KEY environment variable" };
  for (const rel of [".config/breachsense/license.md", ".claude/breachsense/license.md"]) {
    const path = join(home, rel);
    let text: string;
    try { text = read(path); } catch { continue; }
    const key = parseLicenseFile(text);
    if (key) return { key, source: path };
  }
  return null;
}

export function resolveBaseUrl(env: NodeJS.ProcessEnv): string {
  const v = env.BREACHSENSE_API_BASE?.trim();
  if (!v) return DEFAULT_BASE_URL;
  const u = new URL(v);
  if (u.protocol !== "https:") throw new Error("BREACHSENSE_API_BASE must be an https URL");
  return u.origin;
}
