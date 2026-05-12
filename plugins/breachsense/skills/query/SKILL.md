---
name: query
description: Query Breachsense to find leaked employee credentials, infostealer hits, session tokens, exposed API keys / non-human identities (NHI), ransomware leak-site mentions, credentials traded on dark-web hacker forums, full-text search across leaked ransomware files / third-party breaches / unsecured database dumps, and attack-surface findings for a domain. Activate for: breach data, credential exposure, stealer logs, leaked passwords, session cookies, leaked secrets, leaked documents, search any string across leaked files, find company/name mentions in dark-web data, unsecured databases, third-party breaches, dark-web forums, ransomware leaks, attack surface / subdomains / phishing domains, or watchlist alerts.
---

# Breachsense

Breachsense ([breachsense.com](https://breachsense.com)) is a breach-data platform used by security teams to find compromised employee credentials before attackers exploit them. This skill lets the user query the Breachsense API in natural language.

This skill covers **10 endpoints**. All requests go to `https://api.breachsense.com` and require a license key.

---

## License key

The skill supports two ways for the user to provide their license key. Auto-detect at the start of every Breachsense interaction:

1. **Environment variable** — `BREACHSENSE_API_KEY` (preferred for power users, scripts, CI).
2. **Memory file** — `~/.claude/breachsense/license.md`. The user creates this once; you read it on first use of the skill in a session and reuse it for subsequent calls.

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
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/<endpoint>?s=<term>"
```

## Rate limiting

Each license is rate-limited to **1 request per second** sustained, with short bursts of up to 5 requests absorbed. Exceeding the limit returns HTTP `429`:

```json
{"error": true, "message": "Rate limit exceeded. Please throttle to 1 request per second per license."}
```

The limit is keyed off the license, so multiple processes sharing a license share the same rate budget. The total monthly queries is determined by the subscription tier.

## Pagination

All credential endpoints return up to **1000 results per page**. Use `p=N` to fetch subsequent pages. When results are paginated, tell the user and offer to fetch the next page.

---

## Common query parameters

These work across most endpoints:

| Param | Aliases | Meaning |
|---|---|---|
| `s` | `search` | The search term — domain, email, IP, username, crypto wallet, or truncated CC. URL-encode when needed. |
| `p` | | Page number (1-indexed). Each page returns up to 1000 results. |
| `date` | | `YYYYMMDD` or unixtime — only return records on/after this date. |
| `count` | `c`, `cnt` | Include the total number of matching results in the response. |
| `r` | | Return remaining query count for this license. |
| `update` | | Return the Unix timestamp the database was last updated. |
| `unixtime` | `unix`, `epoch` | Display import dates in unixtime format instead of `YYYYMMDD`. |

---

## Endpoints

### `/stealer` — infostealer credentials

Credentials harvested from infostealer malware (Redline, Lumma, StealC, etc.) infecting end-user machines. Each hit typically carries a plaintext password and the URL the credential was used on.

**Extra parameters:**
| Param | Meaning |
|---|---|
| `hid` | Search by hardware ID of the infected device. |
| `pwd` | Search for a specific password. |

**Response fields:**

| Field | Meaning |
|---|---|
| `usr` | Username used to authenticate |
| `pwd` | Password (often plaintext) |
| `src` | Target URL or IP the credential was used on |
| `fle` | File name the credential was found in |
| `fnd` | Date the credential was found (`YYYYMMDD`) |
| `hid`* | Hardware ID of the infected device |
| `iip`* | IP address of the infected device |
| `inf`* | Date the machine was infected |
| `mac`* | Name assigned to the infected device |
| `mal`* | Malware family (Redline, Lumma, etc.) |
| `nme`* | User logged in on the infected device |
| `os`* | Operating system |
| `pth`* | Filesystem path to the malware executable |
| `bid`* | Build ID of the malware |
| `ccn`* | Disclosed credit card number |
| `ccx`* | Credit card expiration date |
| `cwa`* | Exposed crypto wallet address |
| `api`* | API endpoint name |
| `cnt`* | Total number of results (when `count` param is used) |

*Fields marked with \* may not appear in every record.*

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/stealer?s=acme.com"
```

---

### `/combo` — combo lists / third-party breaches

Email:password pairs from credential combo lists circulated on hacking forums. Lower fidelity than stealer logs but broader coverage.

**Response fields:**

| Field | Meaning |
|---|---|
| `usr` | Username / email |
| `pwd` | Password |
| `fle` | File name the credential was found in |
| `fnd` | Date found (`YYYYMMDD` or unixtime) |
| `src`* | Target URL or IP |

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/combo?s=acme.com"
```

---

### `/creds` — third-party breaches with credentials

Records sourced from unsecured database extracts and cracked breach corpora. Higher confidence than `/combo`.

**Extra parameters:**
| Param | Meaning |
|---|---|
| `pwd` | Search for a specific password. |
| `attr` | Include a short description of the breach source. |

**Response fields:**

| Field | Meaning |
|---|---|
| `eml` | Email address |
| `pwd` | Password |
| `src` | Name of the breached website or collection |
| `fnd` | Date found (`YYYYMMDD` or unixtime) |
| `atr`* | Attribution / breach description (when `attr` param is used) |

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/creds?s=acme.com"
```

---

### `/sessions` — session cookies / tokens

Active session cookies and auth tokens harvested from infostealer logs (including Discord user tokens). A live session token can bypass MFA — flag these as **high-priority**.

**Response fields:**

| Field | Meaning |
|---|---|
| `dom` | Domain name associated with the session |
| `cookie_name` | Name of the cookie |
| `cookie_path` | Cookie path |
| `expires` | Cookie expiration date (unixtime) |
| `fnd` | Date the data was found (`YYYYMMDD`) |
| `fle`* | File name the cookie was found in |
| `iip`* | IP address of the infected device |
| `inf`* | Date the machine was infected |
| `mal`* | Malware family |
| `malware_path` | Filesystem path to the malware executable |
| `user_name` | User logged in on the infected device |
| `bid`* | Build ID of the malware |

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/sessions?s=acme.com"
```

---

### `/nhi` — non-human identities (API keys, tokens, secrets)

Leaked API keys, OAuth tokens, service-account credentials, and other non-human identities. These often carry broad blast radius (cloud account access, CI tokens, etc.).

**Extra parameters (filters):**

| Param | Meaning | Example values |
|---|---|---|
| `category` | Token category | `cloud_infra`, `dev_platform`, `ai_platform`, `payment`, `collaboration`, `generic_secret` |
| `platform` | Platform the token authenticates against | `AWS`, `GitHub`, `OpenAI`, `Anthropic`, `Slack`, `Stripe`, `Discord`, `Atlassian` |
| `prefix` | Search for tokens starting with a specific prefix | `AKIA` (AWS), `ghp_` (GitHub), `sk-ant-` (Anthropic) |
| `source_type` | Where the token was extracted from | See table below |
| `hid` | Hardware ID of the infected device | |
| `bid` | Malware build ID | |
| `ip` | IP address of the infected device or host | |

**`source_type` values:**

| Value | Description |
|---|---|
| `browser_store` | Saved password in browser |
| `cookie_file` | Cookie file |
| `browser_artifact` | Browser history / network artifact |
| `env_file` | `.env` file |
| `aws_creds` | AWS credentials file |
| `ssh_key` | SSH key file |
| `json_config` | JSON configuration file |
| `shell_history` | Shell history file |
| `shodan_pem` | Exposed PEM certificate (Shodan) |
| `shodan_etcd` | Exposed etcd store (Shodan) |

**`token_type` values (in response):** `aws_access_key`, `github_pat`, `openai_api_key`, `anthropic_api_key`, and more.

**Response fields:**

| Field | Meaning |
|---|---|
| `token` | The leaked token value |
| `token_type` | Specific token type (e.g. `aws_access_key`, `github_pat`) |
| `category` | Token category (`cloud_infra`, `dev_platform`, etc.) |
| `platform` | Target platform (`AWS`, `GitHub`, etc.) |
| `source_type` | Where the token was extracted from |
| `fnd` | Date found (`YYYYMMDD` or unixtime) |
| `fle`* | File name the token was found in |
| `pth`* | Filesystem path of the file containing the token |
| `src`* | URL or location where the token was found |
| `usr`* | Username associated with the token |
| `hid`* | Hardware ID |
| `ip`* | IP address |
| `bid`* | Build ID of the malware |
| `mal`* | Malware family |
| `os`* | Operating system |
| `av`* | Antivirus on the compromised machine |

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/nhi?s=acme.com"
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/nhi?s=acme.com&category=cloud_infra&platform=AWS"
```

---

### `/darkweb` — ransomware leak sites

Mentions of the target on ransomware leak sites (and the dark-web more broadly). Also aliased as `/darknet`.

**Extra parameters:**
| Param | Meaning |
|---|---|
| `desc` | Search for a short description of the victim. |

**Response fields:**

| Field | Meaning |
|---|---|
| `data` | Domain name of the victim |
| `name` | Company name of the victim |
| `site` | Name of the threat actor / ransomware group |
| `src` | URL containing data associated with the target |
| `found` | Indexed date (`YYYYMMDD`) |
| `desc`* | Victim description |
| `img`* | Signed URL to a screenshot (valid 20 min, Business/Enterprise tier) |
| `tadesc`* | Threat actor description |

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/darkweb?s=acme.com"
```

---

### `/radar` — dark-web forum & market mentions

Hits from dark-web hacker forums and underground marketplaces where credentials, access, and breach data are traded or sold. Coverage includes premium markets like Russian Market on higher tiers.

**Response fields:**

| Field | Meaning |
|---|---|
| `data` | Domain name of the victim |
| `src` | URL containing data associated with the target |
| `found` | Indexed date (`YYYYMMDD`) |
| `img`* | Signed URL to a screenshot (valid 20 min, Business/Enterprise tier) |

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/radar?s=acme.com"
```

---

### `/docs` — full-text search across leaked documents

Full-text search across three corpora: (1) files leaked by ransomware groups, (2) records from third-party breaches, and (3) data from unsecured database exposures. Accepts any search string, company name, person name, address, phone number, keyword, or phrase, and returns the documents/records containing it. Use this to find what's actually inside a breach, not just whether the domain appears in a hit count.

**Response fields:**

| Field | Meaning |
|---|---|
| `doc_id` | Unique document identifier (UUID) |
| `file_name` | Name of the leaked file |
| `file_hash` | SHA-256 hash of the file |
| `file_size` | File size in bytes |
| `content_type` | MIME type of the document |
| `extraction_timestamp` | Date/time the document was processed |
| `leak_date` | Date the breach/leak occurred |
| `threat_actor` | Threat actor or ransomware group |
| `company_name` | Victim company name |
| `domain_name` | Victim domain |
| `url_main_post` | Original leak announcement URL |
| `url_for_breach` | Direct URL to the leaked file |
| `password`* | Password for protected leaks |

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/docs?s=acme.com"
```

---

### `/asm` — attack surface management

Discovered subdomains, exposed services, potential phishing domains, and attack-surface findings for a target domain.

**Extra parameters:**
| Param | Meaning |
|---|---|
| `assets` | Filter to only display discovered assets (subdomains, nameservers, mail servers). |
| `pphish` | Filter to only display potential phishing / typosquatting domains. |

**Response fields:**

| Field | Meaning |
|---|---|
| `dom` | Domain name found |
| `found` | Date found (`YYYYMMDD` or unixtime) |
| `type` | Type of asset: `ns` (nameserver), `mx` (mail server), `ast` (domain asset), `pphish` (potential phishing domain) |
| `cname`* | CNAME of the identified domain |
| `ip`* | IP address of the identified domain |

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/asm?s=acme.com"
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/asm?s=acme.com&pphish"
```

---

### `/account` — watchlist, alerts, and license management

Configure a watchlist so the customer gets alerts when new hits appear for a domain. Also used for webhook setup, test alerts, and license key rotation. The legacy `/monitor` path still works but **prefer `/account`** in new requests.

**Parameters:**

| Param | Meaning |
|---|---|
| `action` | One of: `add`, `del`, `list`, `test`, `rotate` |
| `ast` | Asset to monitor (e.g. `example.com`). Supports `::` separator to target a specific webhook. |
| `notify` | Email address or webhook URL to receive alerts. |
| `premium` | Set to `1` to enable or `0` to disable premium-marketplace monitoring (Business/Enterprise). |

**Actions:**

#### `action=add` — Add an asset to the watchlist
```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=add&ast=acme.com"
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=add&ast=acme.com&notify=security@acme.com"
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=add&ast=acme.com&notify=https://hooks.acme.com/breachsense"
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=add&ast=acme.com&premium=1"
```

#### `action=del` — Remove an asset from the watchlist
```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=del&ast=acme.com"
```

#### `action=list` — List all monitored assets
```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=list"
```

#### `action=test` — Send a test alert
Verifies a webhook is reachable and alert-handling code works against a known payload. The asset must already be configured for monitoring.

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=test&ast=acme.com"
```

To target a single webhook, append it after `::`:
```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=test&ast=acme.com::https://hooks.acme.com/breachsense"
```

The test payload has `"test": true` so receivers can distinguish test from real alerts. Daily limit: **20 test alerts per license**.

Test alert response:
```json
{
  "status": "success",
  "message": "Test alert sent",
  "remaining_today": 19,
  "delivered": { "webhooks_ok": 1, "webhooks_failed": 0, "emails_queued": 0 },
  "webhooks": [{ "url": "https://hooks.acme.com/breachsense", "status": 200 }]
}
```

#### `action=rotate` — Rotate your license key
If a license key is exposed (leaked in logs, committed to a repo), rotate it self-serve. The new key is emailed to configured notification recipients — **not returned in the HTTP response**.

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=rotate"
```

Requirements:
- Paid plan (trial keys cannot be rotated — contact support@breachsense.com)
- At least one notification recipient configured
- One rotation per 24 hours per license
- The old key is invalidated immediately on success

**⚠️ Always confirm with the user before running `action=rotate` — this is a destructive operation that invalidates the current key.**

**Response fields:**

| Field | Meaning |
|---|---|
| `status` | `ok` or `fail` |
| `message`* | Human-readable message (rotation, errors) |
| `ast`* | Asset that is monitored |
| `notify`* | Email or webhook configured |
| `premium`* | Whether premium monitoring is enabled |

---

## Webhook payload format

When a webhook URL is configured via `action=add&notify=https://...`, alerts are delivered as `HTTP POST` with `Content-Type: application/json`. The body is a JSON array of result objects matching the shape from the corresponding API endpoint, with two extra fields:

- **`api`** — which endpoint triggered the alert (one of: `stealer`, `combo`, `creds`, `sessions`, `darkweb`, `radar`, `docs`, `asm`, `nhi`)
- **`ast`** — the monitored asset that matched

If basic auth is configured via `action=add&creds=user:pass`, the request includes an `Authorization: Basic ...` header.

---

## How to present results

When you get a response, **don't dump raw JSON unless asked**. Apply light interpretation:

### Date awareness
- Highlight records from the last 30 days as **"fresh"** and the last 90 days as **"recent."**
- Aggregate older records: instead of listing 47 individual stale entries, say *"plus 47 older records going back to 2018"* and offer to expand on request.

### Surface what matters
- If the response contains plaintext passwords, **surface them in the summary** — that's the point. Don't bury them three levels deep in a JSON tree.
- For session tokens, flag domain + cookie name + observed-on date prominently. Active sessions bypass MFA.
- For NHI hits, surface the credential type (AWS key, GitHub token, Slack webhook, etc.) and the inferred scope. Call out the `source_type` (was it from an `.env` file? a browser password store? exposed on Shodan?).
- For `/docs` results, highlight the file name, leak date, threat actor, and file size to help the user assess exposure scope.

### Flag obvious patterns
Without making security judgments about specific people, call out structural patterns:
- Admin/role accounts: `admin@`, `root@`, `it@`, `helpdesk@`, `security@`, `dev@`
- Reused passwords across multiple employees in the result set
- Very weak passwords (length < 8, common dictionary words like `password123`, `summer2024`, the company name)
- Old credentials that look like they may still be valid (e.g. format suggests current corporate convention)
- For NHI: tokens with broad-scope prefixes (e.g. AWS root keys, admin-level GitHub PATs)

### Pretty-print
When showing JSON, format it. Surface the high-signal fields first (email, password, source, date), put metadata last.

## Suggested follow-ups

After delivering results, **proactively suggest the most useful next move** based on what came back. Examples:

- After `/stealer` returns hits → *"Found 47 stealer hits across 12 employees. Want me to filter to last 6 months, group by employee, or focus on admin accounts?"*
- After plaintext passwords appear → *"3 of these accounts have plaintext passwords. Want me to check `/sessions` for active tokens on the same domain — those would let an attacker bypass MFA right now?"*
- After `/darkweb` returns ransomware mentions → *"This domain shows up on 5 ransomware leak sites. Want me to query `/docs` to see what was actually exposed?"*
- After any meaningful hit → *"Want me to add this domain to your watchlist via `/account` so new hits ping you automatically?"*
- After `/asm` finds exposed services → *"Found 3 exposed dev environments. Want to cross-check `/creds` and `/stealer` for credentials on those subdomains?"*
- After `/nhi` finds leaked tokens → *"Found 2 AWS access keys from stealer logs. Want me to filter by `source_type=env_file` to see if any came from `.env` files in code repos?"*

Pick **one** suggestion at a time — the most relevant to what the user is clearly investigating. Don't bombard.

## Out of scope — do not do these

- **No automated remediation advice** like *"reset all these passwords now"* or *"force MFA on every flagged account."* The user knows their environment; you don't.
- **No security judgments about specific individuals.** Don't label users *"high-risk"* or *"likely compromised"* — present the data, let the customer decide.
- **Don't hide raw data.** Light interpretation is for the summary. The full JSON response should always be available if the user asks (*"show me the raw response"*, *"dump everything"*).
- **Don't run the query without telling the user what you're about to do.** Especially for `/account` mutations (adding/removing domains, rotating keys) — confirm before calling.
- **Don't run `action=rotate` without explicit user confirmation** — this invalidates the current license key immediately.

## Common errors

| Code | Meaning |
|---|---|
| `200` | Success |
| `400` | Bad request — missing or invalid parameters |
| `401` / `403` | License key is missing, expired, or doesn't have access to that endpoint. Tell the user to check their Breachsense dashboard. |
| `404` | Endpoint not found — check the URL path. |
| `422` | Required configuration missing (e.g. license rotation without a notification recipient set). |
| `429` | Rate-limited. Back off and tell the user to retry in a moment. If during rotation: already rotated within the 24h window. |
| `500` | Server error — contact support@breachsense.com. |

**Empty result set** → say so plainly: *"No hits for acme.com on /stealer. Try /combo or /creds for older / lower-fidelity sources, or widen the date range."*

## Test data

You can use `s=ignore@example.com` or `s=example.com` to test queries against the API without consuming quota against a real domain.
