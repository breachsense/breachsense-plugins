---
name: breachsense
description: Query Breachsense breach-data APIs to find compromised employee credentials, infostealer hits, leaked session tokens, dark-web exposure, attack surface findings, and leaked API keys / non-human identities. Activate when the user asks about breach data, credential exposure, stealer logs, leaked passwords, dark-web mentions, ransomware leak sites, exposed databases, leaked secrets, ASM, or wants to set up a watchlist for a domain.
---

# Breachsense

Breachsense ([breachsense.com](https://breachsense.com)) is a breach-data platform used by security teams to find compromised employee credentials before attackers exploit them. This skill lets the user query the Breachsense API in natural language.

This skill covers 10 endpoints. All requests go to `https://api.breachsense.com` and require a license key.

## License key

The skill supports two ways for the user to provide their license key. Auto-detect at the start of every Breachsense interaction:

1. **Environment variable** — `BREACHSENSE_API_KEY` (preferred for power users, scripts, CI).
2. **Memory file** — `~/.claude/breachsense/license.md`. The user creates this once; you read it on first use of the skill in a session and reuse it for subsequent calls in the same session.

**Detection order:**
- If `BREACHSENSE_API_KEY` is set in the environment, use it.
- Otherwise, read `~/.claude/breachsense/license.md` if it exists. The file should contain just the license key (one line), optionally with a `key:` prefix or wrapped in fenced markdown.
- If neither is set, tell the user clearly:

    > I need your Breachsense license key. Either:
    > - Set `BREACHSENSE_API_KEY=<key>` in your environment (recommended), or
    > - Create `~/.claude/breachsense/license.md` containing your key.
    >
    > You can find your key in your Breachsense customer dashboard.

Never log, echo, or include the license key in user-facing output. When constructing a curl command for the user to run, prefer the env-var form (`-H "lic: $BREACHSENSE_API_KEY"`) so the key isn't pasted in plaintext.

## Auth header

The license key is passed in the `lic` HTTP header (or `?lic=<key>` query param as a fallback). Default to the header form:

```
curl -s -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/<endpoint>?search=<term>"
```

## Common query parameters

These work across most endpoints:

| Param | Meaning |
|---|---|
| `search` | The thing to look up — usually a domain, email, or username. URL-encode when needed. |
| `date` | `YYYYMMDD` — only return records on/after this date. |
| `p` | Page number for paginated results (1-indexed). |
| `strict` | `1` to enable strict matching (exact domain only, no subdomains). |

## Endpoints

### `/stealer` — infostealer credentials
Credentials harvested from infostealer malware (Redline, Lumma, StealC, etc.) infecting end-user machines. Each hit typically carries a plaintext password and the URL the credential was used on.

```
curl -s -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/stealer?search=acme.com"
```

### `/combo` — combo lists / third-party breaches
Email:password pairs from credential combo lists circulated on hacking forums. Lower fidelity than stealer logs but broader coverage.

```
curl -s -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/combo?search=acme.com"
```

### `/creds` — unsecured DBs + cracked breaches
Records sourced from unsecured database extracts and cracked breach corpora. Higher confidence than `/combo`.

```
curl -s -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/creds?search=acme.com"
```

### `/sessions` — session cookies / tokens
Active session cookies and auth tokens harvested from infostealer logs (including new Discord user tokens). A live session token can bypass MFA — flag these as high-priority.

```
curl -s -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/sessions?search=acme.com"
```

### `/radar` — premium dark-web markets
Hits from premium markets (Russian Market today, others added over time). These are credentials actively being sold.

```
curl -s -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/radar?search=acme.com"
```

### `/asm` — attack-surface mapping
Discovered subdomains, exposed services, and attack-surface findings for a target domain.

```
curl -s -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/asm?search=acme.com"
```

### `/darkweb` — ransomware leak sites
Mentions of the target on ransomware leak sites (and the dark-web more broadly). Aliased as `/darknet`.

```
curl -s -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/darkweb?search=acme.com"
```

### `/docs` — full-text search across leaked files
Full-text search over documents leaked by ransomware groups and other dark-web sources. Useful for finding what was actually exposed (contracts, employee data, source code).

```
curl -s -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/docs?search=acme.com"
```

### `/account` (also `/monitor`) — watchlist + alerts
Configure a watchlist so the customer gets alerts when new hits appear for a domain. The endpoint is currently aliased — `/account` is the new name, `/monitor` still works during the transition. **Prefer `/account`** in new requests.

```
curl -s -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=add&dom=acme.com"
```

### `/nhi` — non-human identities
Leaked API keys, OAuth tokens, service-account credentials, and other non-human identities. These often carry broad blast radius (cloud account access, CI tokens, etc.).

```
curl -s -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/nhi?search=acme.com"
```

## How to present results

When you get a response, **don't dump raw JSON unless asked**. Apply light interpretation:

### Date awareness
- Highlight records from the last 30 days as "fresh" and the last 90 days as "recent."
- Aggregate older records: instead of listing 47 individual stale entries, say *"plus 47 older records going back to 2018"* and offer to expand on request.

### Surface what matters
- If the response contains plaintext passwords, **surface them in the summary** — that's the point. Don't bury them three levels deep in a JSON tree.
- For session tokens, flag domain + cookie name + observed-on date prominently. Active sessions bypass MFA.
- For NHI hits, surface the credential type (AWS key, GitHub token, Slack webhook, etc.) and the inferred scope.

### Flag obvious patterns
Without making security judgments about specific people, call out structural patterns:
- Admin/role accounts: `admin@`, `root@`, `it@`, `helpdesk@`, `security@`, `dev@`
- Reused passwords across multiple employees in the result set
- Very weak passwords (length < 8, common dictionary words like `password123`, `summer2024`, the company name)
- Old credentials that look like they may still be valid (e.g. format suggests current corporate convention)

### Pretty-print
When showing JSON, format it. Surface the high-signal fields first (email, password, source, date), put metadata last.

## Suggested follow-ups

After delivering results, **proactively suggest the most useful next move** based on what came back. Examples:

- After `/stealer` returns hits → *"Found 47 stealer hits across 12 employees. Want me to filter to last 6 months, group by employee, or focus on admin accounts?"*
- After plaintext passwords appear → *"3 of these accounts have plaintext passwords. Want me to check `/sessions` for active tokens on the same domain — those would let an attacker bypass MFA right now?"*
- After `/darkweb` returns ransomware mentions → *"This domain shows up on 5 ransomware leak sites. Want me to query `/docs` to see what was actually exposed?"*
- After any meaningful hit → *"Want me to add this domain to your watchlist via `/account` so new hits ping you automatically?"*
- After `/asm` finds exposed services → *"Found 3 exposed dev environments. Want to cross-check `/creds` and `/stealer` for credentials on those subdomains?"*

Pick **one** suggestion at a time — the most relevant to what the user is clearly investigating. Don't bombard.

## Out of scope — do not do these

- **No automated remediation advice** like *"reset all these passwords now"* or *"force MFA on every flagged account."* The user knows their environment; you don't.
- **No security judgments about specific individuals.** Don't label users *"high-risk"* or *"likely compromised"* — present the data, let the customer decide.
- **Don't hide raw data.** Light interpretation is for the summary. The full JSON response should always be available if the user asks (*"show me the raw response"*, *"dump everything"*).
- **Don't run the query without telling the user what you're about to do.** Especially for `/account` mutations (adding domains to watchlist) — confirm before calling.

## Common errors

- `401` / `403` → license key is missing, expired, or doesn't have access to that endpoint. Tell the user to check their Breachsense dashboard.
- `429` → rate-limited. Back off and tell the user to retry in a moment.
- Empty result set → say so plainly: *"No hits for acme.com on /stealer. Try /combo or /creds for older / lower-fidelity sources, or widen the date range."*
