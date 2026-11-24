const URL_BASIC_AUTH = /(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi;
const CREDS_PARAM = /(creds=)[^&\s"']+/gi;

/** Remove secrets (license key, webhook basic-auth) from any text before it leaves the process. */
export function redact(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 8) out = out.split(s).join("[redacted]");
  }
  return out.replace(URL_BASIC_AUTH, "$1[redacted]@").replace(CREDS_PARAM, "$1[redacted]");
}
