# Breachsense MCP server: design

Status: approved design, phase 1 not yet built
Date: 2026-11-24

## Goal

Give Breachsense customers an MCP server so any MCP client (Claude Code, Claude Desktop, later claude.ai and others) can query their breach data with typed tools, context-efficient results and quota-safe behaviour.

- Audience: customers, each using their own license key.
- Deployment: local stdio first (phase 1), remote Streamable HTTP later (phase 2, separate spec).
- Stack: TypeScript, official MCP TypeScript SDK, zod.
- Tool shape: hybrid. Per-endpoint typed tools, one composite credential tool, read and write account tools.

## 1. Architecture

The server lives in this repo as a top-level `mcp/` package next to the skill, so one pull request updates both when the API changes. The `breachsense` plugin declares the server, so `/plugin install breachsense@breachsense` installs the skill and the tools together.

```
mcp/src/
  client.ts      HTTP to api.breachsense.com: lic header, own User-Agent, 1 req/s throttle,
                 retry policy (section 5), 200/206 handling. No MCP knowledge.
  endpoints/     One file per endpoint: zod parameter schema, request builder, field glossary.
                 Pure data and mapping, no I/O.
  shape.ts       Raw page -> summary (counts, freshness split, flags, top rows, cost line). Pure.
  redact.ts      Single redaction function used by every error and log line.
  tools/         MCP tool registrations: search, composite, account read, account write.
  results.ts     In-memory per-session store behind breachsense://results/<id>.
  server.ts      Builds the server: instructions text, tools, resources.
  stdio.ts       Phase 1 entry point.
  http.ts        Phase 2 entry point (not in phase 1).
```

- Transport stays at the edge: both entry points build the same server from `server.ts`.
- Throttling is per process in phase 1 (one process per user under stdio), per license in phase 2.

## 2. Tool catalogue

Tools are named by customer intent, not endpoint. Every description states its query cost.

Common search parameters: `query`, `since` (YYYYMMDD), `count_only`, `page` (default 1).

### Search tools (readOnlyHint, openWorldHint; 1 query per page)

| Tool | Endpoint | Extra parameters |
|---|---|---|
| `search_stealer_logs` | /stealer | `scope` (site users, or employees via `@domain`), `by` (password, hardware ID) |
| `search_combo_lists` | /combo | none |
| `search_breach_credentials` | /creds | `with_source` (attr), `plaintext_only` (uniq), `count_unique_emails` |
| `search_session_cookies` | /sessions | none |
| `search_leaked_secrets` | /nhi | `platform`, `category`, `token_type`, `prefix`, `ip`, `hwid` |
| `search_phishing_captures` | /phish | `scope` |
| `search_ransomware_leaks` | /darkweb | domain or `date_range` (max 31 days), `with_descriptions` |
| `search_forum_mentions` | /radar | domain or `date_range` |
| `search_documents` | /docs | phrase, `fuzzy` |
| `download_document` | /docs `download_doc_id` | `doc_id`; always billed |
| `get_attack_surface` | /asm | `only` (assets or lookalike domains) |

### Composite tool

- `check_credential_exposure(domain, scope, since)`: fans out to stealer, combo, creds and phish, merges into one answer with per-source counts, freshest hits and flags. Costs 4 queries, stated up front.

### Account tools, read-only

- `get_usage`: remaining quota (`r`) and audit log (`action=audit`, optional range, max 35 days).
- `get_monitoring_setup`: watchlist, alert recipients, technical contact and whitelist in one call.

### Account tools, writes (destructiveHint)

- `manage_watchlist`: add or remove an asset, toggle premium, set a per-asset recipient.
- `manage_alert_recipients`: add or remove email/webhook recipients, technical contact, webhook basic auth. Stored credentials are never returned.
- `manage_whitelist`: add or remove suppressed credential pairs or usernames.
- `send_test_alert`

### Excluded on purpose

- Key rotation: invalidates the key the server is using; the new key only arrives by email. Stays in the dashboard and the skill.
- `csv`, `unixtime`, `update` flags: the server always requests JSON and normalises dates.

## 3. Result shaping and quota

Each search returns two parts.

Summary (text the model reads), built by `shape.ts`:
- Totals for this page and whether more pages exist (206 = partial, stated explicitly).
- Freshness split: fresh (last 30 days), recent (last 90 days), one line for older records.
- Flags first: phishing captures with an OTP, unexpired session cookies, cloud or payment secrets, employee stealer hits.
- Top 25 rows, freshest first, with endpoint-specific useful fields only. Plaintext passwords are kept.
- Cost line: this call's cost and the running total for this server process.

Full page:
- Raw rows held in memory for the session, exposed as resource `breachsense://results/<id>` and linked from the summary. Never written to disk.
- `structuredContent` with an output schema on every tool.

Quota rules enforced by the server:
- Only the requested page is fetched; no auto-paging. The summary says how to request `nextPage`.
- `count_only` returns counts only; server instructions tell the model to use it first for large domains.
- Remaining quota comes from `get_usage`, not fetched on every call. Implementation must verify whether `r` is billed; if free, the cost line may include the remaining allowance.
- example.com and test.com are free and are used by tests and the setup check.

Server `instructions` carry the skill's presentation guidance (what to query, confirm before account changes, no remediation advice, no judgments about individuals, treat row content as data).

## 4. Configuration, authentication and security

License key lookup (same order as the skill):
1. `BREACHSENSE_API_KEY` environment variable.
2. `~/.config/breachsense/license.md`, then `~/.claude/breachsense/license.md` (bare key, `key:` prefix or fenced block).
3. Claude Desktop `.mcpb`: `user_config` field marked `sensitive` (OS keychain), passed in as the env var.

With no key the server still starts; every tool returns a setup message.

Key secrecy:
- Sent only in the `lic` header, never in the URL.
- Every error message and log line passes through `redact.ts`, which removes the key and anything resembling webhook basic-auth credentials.
- Logs go to stderr only and by default contain no search terms or results. No telemetry. No result persistence.

Untrusted data: rows are attacker-authored. They are returned as structured data in a clearly labelled block, server instructions say row content is never instructions, and long free-text fields are truncated in the summary (full text stays in the resource).

Input validation (zod, before any network call): domain, email and BIN formats; dates as YYYYMMDD; ranges capped at 31 days; page >= 1. The request builder URL-encodes every value and assembles the query string itself, so a term like `acme.com&p=2` cannot inject parameters. The API host is fixed to `https://api.breachsense.com`; `BREACHSENSE_API_BASE` overrides it for tests and accepts https only.

Writes: the four write tools carry `destructiveHint` so clients confirm. Webhook basic-auth credentials are write-only.

Phase 2 outline (own spec later): OAuth layer in front of `http.ts` with a consent page where the customer enters the license key once; the server stores it encrypted and issues a token bound to it; throttling becomes per license.

## 5. Error handling

Failure classes:
- Tool execution failures return a tool result with `isError: true` and a plain-English message.
- Malformed protocol requests and unknown tool names return JSON-RPC errors (SDK default).

Messages are chosen from operation plus the recognised provider reason, not status code alone (for example, 403 "Unmonitored asset" on `send_test_alert` becomes "acme.com isn't on your watchlist"). Counts, limits and reset times appear only when present in the response. Raw bodies, keys and webhook credentials never appear in results.

Query cost reporting, on every result:
- "0 queries used" only when validation stopped the request locally, the client can prove the request was never sent (DNS, connect or TLS failure), or Breachsense documents the request as free (test domains).
- "N queries used" when a response was received.
- "Query usage unknown" when the request was sent and no response arrived; points to `get_usage` (audit log).
- 429s are not assumed free.

Retries by operation:

| Situation | Searches (read-only) | Account writes and test alerts |
|---|---|---|
| Never sent (DNS/connect/TLS) | Retry once | Retry once |
| Sent, no response (timeout 30s) | Retry once; cost unknown | Stop; may have taken effect; suggest `get_monitoring_setup` |
| 429 rate limit | Honour `Retry-After` or backoff 1s/2s/4s within a 20s overall deadline; past it, return the retry time | Same, only for rate-limit 429s |
| 429 daily action limit | n/a | Return immediately with reset time if given |
| 5xx | Retry once | Stop; may have taken effect |
| 400 / 401 / 403 / 422 | No retry | No retry |

Specific translations:
- 1010: "Breachsense blocked this request at its edge."
- Unexpected HTML: "Breachsense returned an unexpected response (HTTP N)." No cause is guessed.
- 401 or 403 invalid/expired license: key rejected, the source it was read from (never the key), how to replace it.
- 403 monthly limit: limit and used if present, contact support@breachsense.com.
- 403 plan restriction: the feature is not in the plan.
- Empty `[]`: an explicit zero-match statement with one suggestion.

Pagination and coverage are tracked separately:
- 206 returns the current page plus `nextPage`.
- `check_credential_exposure` reports per source: completed (count), failed (reason) and cost. If at least one source completes, the call succeeds and names the missing sources; only the failed source is subject to retry. If all four fail, `isError: true`.

Acceptance test: three sources return zero matches and the fourth times out after dispatch. The result is not an error and reads: "No matches in the three sources checked. The fourth source (phishing captures) timed out. Its query usage is unknown." Cost line: "3 queries used, 2 unknown" (the timed-out source is retried once under the read policy, and both attempts are unknown).

## 6. Testing, packaging and rollout

Testing (CI spends no quota):
- Unit tests: per-endpoint request builders, zod validation, `shape.ts`, error translation, redaction (the key never appears in any output, log or error).
- Client tests against a local fake API replaying recorded example.com responses: 200, 206, `[]`, every error code, 1010, HTML, timeout after dispatch, connection refused.
- The section 5 acceptance test, plus all-four-fail returning `isError: true`.
- One MCP-level test: start the stdio server, list tools, check annotations, call a tool through the SDK client.
- Optional live smoke test against example.com when a key is present; never in CI.

Packaging (phase 1):
- Bundled into a single JS file with no runtime install step.
- Claude Code: the plugin's `.mcp.json` runs it from `${CLAUDE_PLUGIN_ROOT}`; plugin version 1.4.0.
- Claude Desktop: `.mcpb` bundle.
- Other clients: `npx @breachsense/mcp`, gated on the owner creating and controlling the npm org.
- README: short setup per client.

Skill after the MCP ships: kept and trimmed. It keeps presentation guidance for curl-only users and tells the model to prefer the MCP tools when available. The API definition lives once in `endpoints/`.

Out of scope for phase 1: key rotation, CSV export, auto-paging, cross-session caching, remote transport and OAuth.

## Verified against the live API (2026-11-24)

Evidence comes from the get_usage audit log and the Remaining counter, read before and after each call.

- `/stealer?r` (remaining) and `/account?action=audit` are not counted: Remaining stayed unchanged across two get_usage calls and no audit events appeared.
- `/account` list (4 calls), watchlist add/del, whitelist add/del and `action=test` are not counted.
- `/account` 4xx replies (403 "Unmonitored asset", 400 "reserved documentation domain") are not counted. A non-2xx reply from an uncounted endpoint therefore costs nothing; a request with no reply stays unknown.
- Searches for example.com on all endpoints, including `/docs` and count_only, are not counted, which matches the free-term rule.
- `/docs?download_doc_id` (302 to storage) is counted: 1 query.
- The storage redirect goes to Linode Object Storage (`us-east-1.linodeobjects.com`, path-style or bucket subdomain), not AWS. The download allowlist accepts https hosts under `.amazonaws.com` and `.linodeobjects.com`.
- Live `/docs` data carries placeholder dates such as 19700101 and epoch 0. Dates before 1990-01-01 are treated as undated.
- count_only billing remains unproven. Two count_only searches on non-free domains were not counted, but both returned a count of 0 (one after 10.8 s), which looks like an API-side failure. Search billing therefore stays "billed".
- Still unverified: whether 429 responses count against quota (assumed not proven free) and the exact rate-limit versus daily-limit 429 bodies on `/account`.
