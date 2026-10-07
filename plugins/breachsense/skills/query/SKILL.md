---
name: query
description: Query Breachsense to find leaked employee credentials, infostealer hits, session tokens, exposed API keys / non-human identities (NHI), credentials harvested by phishing kits, ransomware leak-site mentions, credentials traded on dark-web hacker forums, full-text search across leaked ransomware files / third-party breaches / unsecured database dumps, and attack-surface findings for a domain. Activate for: breach data, credential exposure, stealer logs, leaked passwords, session cookies, leaked secrets, leaked documents, search any string across leaked files, find company/name mentions in dark-web data, unsecured databases, third-party breaches, dark-web forums, ransomware leaks, phished credentials / phishing-kit captures, attack surface / subdomains / lookalike or phishing domains, watchlist alerts, webhook setup, API usage / remaining queries / who used our queries, or suppressing noisy / false-positive / already-remediated credential alerts.
---

# Breachsense

Breachsense ([breachsense.com](https://breachsense.com)) is a breach-data platform used by security teams to find compromised employee credentials before attackers exploit them. This skill lets the user query the Breachsense API in natural language.

This skill covers **11 endpoints**. All requests go to `https://api.breachsense.com` and require a license key.

---

## License key

Auto-detect the key at the start of every Breachsense interaction:

1. **Environment variable** `BREACHSENSE_API_KEY` (preferred for power users, scripts, CI).
2. **Memory file** `~/.claude/breachsense/license.md`. Read it on first use in a session and reuse it. The file contains just the key, optionally with a `key:` prefix or inside a fenced block.

If neither is set, tell the user:

> I need your Breachsense license key. Either:
> - Set `BREACHSENSE_API_KEY=<key>` in your environment (recommended), or
> - Create `~/.claude/breachsense/license.md` containing your key.

Never log, echo, or include the license key in user-facing output. When showing a curl command, use the env-var form so the key isn't pasted in plaintext.

## Auth header

Pass the key in the `lic` HTTP header (or `?lic=<key>` as a fallback):

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/<endpoint>?s=<term>"
```

Build every URL as `?param=value&param=value`. Each option is its own query parameter. Never append options to the search value: `s=acme.com?p=2` searches for the literal string `acme.com?p=2`. The correct form is `s=acme.com&p=2`.

## Rate limiting

Each license is limited to **1 request per second** sustained, with short bursts of up to 5 absorbed, unless the customer's contract sets a different rate. Exceeding it returns HTTP `429`:

```json
{"error": true, "message": "Rate limit exceeded. Please throttle to 1 request per second per license."}
```

The limit is per license, so processes sharing a key share the budget.

## Usage and quota

Every request that returns data counts as **one query** against the license's monthly allowance. That includes **every page** and **every endpoint in a fan-out**. A domain with many results can use dozens of queries if you page through all of it.

- Check what's left with `r` (alias `remaining`) on any search endpoint except `/asm` and `/docs`. It returns `{"Remaining": N}` instead of results.
- Fetch page 1 first, report what came back, and **ask before fetching more pages**. Never auto-page through a large result set.
- When the user asks "who used our queries" or why usage is high, use the audit log (`/account?action=audit`, see below), not guesswork.
- Searches for `example.com`, `test.com`, or any subdomain or email at them are not billed. Use them to test an integration. `/docs?download_doc_id=` is always billed.

When the allowance is exhausted, search endpoints return HTTP `403` (some with an empty message, `/asm` with `429` and `limit`/`used` fields). Tell the user they have hit their monthly limit and to contact their Breachsense account manager.

## Pagination

- `p` is the page number, starting at **1**. Default page size is **500**.
- **HTTP `206`** means more pages exist. **HTTP `200`** means this is the last (or only) page. Always check the status, not just the body, and tell the user when a result is partial.
- Paginated: `/stealer`, `/combo`, `/creds`, `/nhi`, `/phish`, `/sessions`, `/darkweb`, `/docs`.
- **Not paginated:** `/radar` and `/asm` return everything in one response. Do not send `p` to them; page 2 and beyond return `[]` and are still billed.
- `limit` (or `l`) changes the page size on most endpoints. Leave it at the default unless the user asks.

---

## Common query parameters

| Param | Meaning | Notes |
|---|---|---|
| `s` | The search term (alias `search`). | URL-encode it. |
| `p` | Page number, starting at 1. | See Pagination. |
| `date` | `YYYYMMDD`: only records on or after this date. | Also accepts unixtime on most endpoints. `/sessions` and `/docs` take `YYYYMMDD` only. Use it to answer "anything new since X" or "last 6 months" without paging old data. |
| `count` | Return only the total number of matches, as `{"cnt": N}` (`/docs`: `{"count": N}`). | Replaces the results. Still counts as a query. |
| `r` | Return remaining monthly queries, as `{"Remaining": N}`. | Not on `/asm` or `/docs`. |
| `update` | Return when that dataset was last updated. | Not on `/asm`. |
| `unixtime` | Dates as unixtime instead of `YYYYMMDD` (aliases `unix`, `epoch`). | Ignored by `/sessions`, `/asm`, `/docs`. |

Dates come back as `YYYYMMDD` by default.

---

## Endpoints

### Credential questions fan out to four endpoints

When the user asks something general about leaked credentials (*"were any of our passwords leaked"*, *"check acme.com for exposed credentials"*), query **all four** of `/stealer`, `/combo`, `/creds` and `/phish`, then merge the results. Each covers a different way the credential was obtained:

| Endpoint | How the credential reached us |
|---|---|
| `/stealer` | Malware scraped a saved password off the victim's device |
| `/combo` | Turned up in an aggregated combo list |
| `/creds` | Came from a named third-party breach or database extract |
| `/phish` | The victim typed it into a phishing page |

A fan-out costs four queries (more if any endpoint returns `206`). Tell the user it's four lookups. Give per-endpoint counts in the summary. If an endpoint returns nothing, say so, so a clean result isn't mistaken for a query that never ran.

When the user names one source (*"check the stealer logs"*), query just that endpoint.

**Employees vs. customers.** `s=acme.com` on `/stealer` and `/phish` matches credentials *for* acme.com, which includes customers logging into the acme.com site. `s=@acme.com` matches only usernames ending in `@acme.com`, i.e. the company's own staff. Ask which the user means when it matters.

If the problem is too *many* results, see the alert whitelist under `/account`.

### `/stealer`: infostealer credentials

Credentials harvested by infostealer malware (Redline, Lumma, StealC, etc.) on end-user machines. Each hit usually carries a plaintext password and the URL it was used on.

**Search (`s`):** domain, `@domain` (employees only), email, username, IP address, /24 range, or a truncated card (`411111-1111`, first six + last four).

**Extra parameters:**
| Param | Meaning |
|---|---|
| `pwd` | Search by password (aliases `pass`, `password`). Useful in incident response. |
| `hid` | Search by hardware ID of the infected device (alias `hwid`). |
| `csv` | Return CSV instead of JSON. |

**Response fields:**

| Field | Meaning |
|---|---|
| `usr` | Username used to authenticate |
| `pwd` | Password (often plaintext) |
| `src` | Site or IP the credential was used on |
| `fle` | File the credential was found in |
| `fnd` | Date found |
| `hid`* | Hardware ID of the infected device |
| `iip`* | IP address of the infected device |
| `inf`* | Date the machine was infected |
| `mac`* | Name of the infected device |
| `mal`* | Malware family |
| `nme`* | User logged in on the infected device |
| `os`* | Operating system |
| `av`* | Antivirus on the infected device |
| `pth`* | Path to the malware executable |
| `bid`* | Malware build ID |
| `ccn`* | Truncated card number |
| `ccx`* | Card expiry |
| `cwa`* | Crypto wallet address |

*Fields marked \* are not in every record.*

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/stealer?s=acme.com"
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/stealer?s=@acme.com&date=20260101"
```

---

### `/combo`: combo lists

Email:password pairs from credential combo lists circulated on hacking forums. Lower fidelity than stealer logs, broader coverage.

**Search (`s`):** domain, email, username, IP. **Extra:** `pwd` (aliases `pass`, `password`) to search by password.

**Response fields:** `usr` (username / email), `pwd`, `fle` (file found in), `fnd` (date found), `src`* (target URL or IP).

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/combo?s=acme.com"
```

---

### `/creds`: third-party breaches

Credentials parsed out of named third-party breaches and unsecured database extracts, with hashes cracked to plaintext where possible.

**Search (`s`):** email or domain only. There is no password search on this endpoint.

**Extra parameters:**
| Param | Meaning |
|---|---|
| `attr` | Add `atr`, a short description of the breach source. |
| `hash` | Add `dec`: `1` = `pwd` is usable plaintext (cracked or originally plaintext), `0` = still a hash. |
| `uniq` | Return only rows with a usable plaintext password, reduced to `eml` + `pwd`. |
| `count=emails` | Count unique email addresses instead of rows. |

**Response fields:** `eml`, `pwd`, `src` (name of the breached site or collection), `fnd`, `atr`* (with `attr`), `dec`* (with `hash`).

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/creds?s=acme.com&attr&hash"
```

---

### `/sessions`: session cookies

Session cookies harvested from infostealer logs. A live session cookie can bypass MFA, so flag these as **high priority**.

**Search (`s`):** domain. An email search is reduced to its domain and returns the whole domain. `date` takes `YYYYMMDD` only.

**Response fields:**

| Field | Meaning |
|---|---|
| `dom` | Domain the cookie belongs to |
| `cookie_name` | Cookie name |
| `val` | Cookie value |
| `cookie_path` | Cookie path |
| `expires` | Cookie expiry (`YYYYMMDD`) |
| `fnd` | Date found |
| `fle`* | File the cookie was found in |
| `iip`* | IP address of the infected device |
| `hid`* | Hardware ID |
| `inf`* | Infection date (raw, format varies) |
| `mal`* | Malware family |
| `bid`* | Malware build ID |
| `os`*, `av`* | Operating system, antivirus |
| `cty`* | Country of the infected device |
| `cwa`* | Crypto wallet address |
| `malware_path`* | Path to the malware executable (only when it differs from the cookie path) |

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/sessions?s=acme.com"
```

---

### `/nhi`: non-human identities (API keys, tokens, secrets)

Leaked API keys, OAuth tokens, service-account credentials and other secrets. These often carry a broad blast radius.

**Search (`s`):** domain, or an exact email address. Filters can be combined with `s`:

| Param | Meaning | Example values |
|---|---|---|
| `platform` | Platform the token authenticates against | `AWS`, `GitHub`, `OpenAI`, `Anthropic`, `Slack`, `Stripe`, `Discord`, `Atlassian` |
| `category` | Token category | `cloud_infra`, `dev_platform`, `ai_platform`, `payment`, `collaboration`, `generic_secret` |
| `token_type` | Specific token type (case-insensitive) | `aws_access_key`, `github_pat`, `openai_api_key`, `stripe_live_secret` |
| `prefix` | Tokens starting with a prefix | `AKIA` (AWS), `ghp_` (GitHub), `sk-ant-` (Anthropic) |
| `hid` | Hardware ID of the infected device | |
| `bid` | Malware build ID | |
| `ip` | IP address of the infected device or host | |

`source_type` is a **response field, not a filter**. To narrow by source, fetch and filter the results yourself.

**`source_type` values:** `browser_store`, `cookie_file`, `browser_artifact`, `env_file`, `aws_creds`, `ssh_key`, `json_config`, `shell_history`, `shodan_pem`, `shodan_etcd`.

**Response fields:** `token`, `token_type`, `category`, `platform`, `source_type`, `fnd`, and when present `domain`, `usr`, `pwd`, `fle`, `pth`, `src`, `hid`, `ip`, `bid`, `mal`, `os`, `av`, `nme`, `mac`, `inf`.

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/nhi?s=acme.com"
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/nhi?s=acme.com&platform=AWS&category=cloud_infra"
```

---

### `/phish`: credentials harvested by phishing kits

Credentials a victim typed into a phishing page, recovered from the kit operators' own exfiltration channels. A hit means the person **actually submitted the credential to an attacker**, at a known time, on a known fake page.

**Search (`s`):** domain (rolls subdomains up), `@domain` (employees only), exact email, or IP. **Filters** (usable with or without `s`): `brand`, `country`, `kit`.

**Field naming trap:** on `/stealer`, `src` is the legitimate site. Here the URL fields are the **attacker's** pages. Do not map them onto each other.

| Field | Meaning |
|---|---|
| `usr` | Username / email the victim submitted |
| `pwd` | Password the victim submitted |
| `kit_url` | Phishing kit host |
| `lure_url`* | Page that harvested the credential (only when it differs from `kit_url`) |
| `brand` | Brand the kit impersonated (e.g. `microsoft`, `dropbox`) |
| `ip` | Victim IP at submission |
| `country`, `city`, `region`, `isp` | Victim geolocation |
| `os`, `browser`, `user_agent` | Victim device fingerprint |
| `phone`* | Phone number submitted |
| `otp`* | One-time code submitted. Implies live session interception, flag prominently |
| `visitor_id`* | Kit-assigned visitor ID |
| `fnd` | Date captured |

**Contract-gated fields.** These appear only for licenses with the phish PII entitlement. If absent, that is entitlement, not missing data: `card_masked` (first 6 + last 4), `card_expiry`, `card_holder`, `card_valid_luhn` (boolean), `dob`, `ssn`, `mothers_maiden_name`.

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/phish?s=acme.com"
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/phish?s=user@acme.com"
```

---

### `/darkweb`: ransomware leak sites

Victims listed on ransomware and extortion leak sites. Also served at `/darknet`.

**Search:** `s` = a domain (exact match on the victim domain; subdomains are not rolled up), or `range=YYYYMMDD-YYYYMMDD` to list every victim indexed in that window (31 days max).

**Extra flags:**
| Param | Meaning |
|---|---|
| `desc` | Add `desc`, a short description of the victim. |
| `tadesc` | Add `tadesc`, a description of the threat actor. |
| `csv` | Return CSV. |

**Response fields:** `data` (victim domain), `name` (victim company), `site` (threat actor / ransomware group), `src` (.onion URL of the listing), `found` (date indexed), `img`* (signed screenshot URL, valid for a short time), `desc`*, `tadesc`*.

The `src` URLs are .onion addresses; the user needs Tor Browser to open them.

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/darkweb?s=acme.com&desc"
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/darkweb?range=20260901-20260930"
```

---

### `/radar`: dark-web forum and market mentions

Hits from hacker forums and underground marketplaces where access, credentials and breach data are traded. Not paginated.

**Search (`s`):** domain. `range` is also supported. `desc` / `tadesc` work only together with `date=`.

**Response fields:** `data` (victim domain), `src` (URL of the post or listing), `found` (date indexed), `img`* (signed screenshot URL).

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/radar?s=acme.com"
```

---

### `/docs`: full-text search across leaked documents

Full-text search inside files leaked in ransomware attacks, third-party breaches, and unsecured databases. It searches the **content** of the files, not just their metadata. Accepts any string: company or person name, address, phone number, project name, keyword or phrase. Fixed page size of 500.

**Search (`s`):** any string. Quote multi-word phrases: `s=%22Bank%20Statement%22`.

**Extra parameters:**
| Param | Meaning |
|---|---|
| `fuzzy=1` | Fuzzy matching instead of exact phrase matching. |
| `download_doc_id=<doc_id>` | Download one document (the original file, or its extracted text if the original is no longer available). Billed. |
| `download_all` + `format=json\|csv` | Export the matching document list. |
| `date` | `YYYYMMDD` only. |

**Response fields:** `doc_id`, `file_name`, `file_hash` (SHA-256), `file_size` (bytes), `content_type`, `extraction_date` (`YYYYMMDD`), `leak_date` (`YYYYMMDD`), `source_type` (`ransomware_leak` or `third_party_breach`), `threat_actor`, `company_name`, `domain_name`, `url_main_post`, `url_for_breach`.

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/docs?s=%22Acme%20Corp%22"
curl -sL -H "lic: $BREACHSENSE_API_KEY" -OJ "https://api.breachsense.com/docs?download_doc_id=87958673-3053-4674-b704-af69226cb6a0"
```

---

### `/asm`: attack surface management

Discovered subdomains, nameservers, mail servers and potential phishing / lookalike domains for a domain on the customer's watchlist. Not paginated.

**Search (`s`):** a domain already on the watchlist (alias `domain`).

**Extra parameters:**
| Param | Meaning |
|---|---|
| `assets` | Only discovered assets (subdomains, nameservers, mail servers). |
| `pphish` | Only potential phishing / lookalike domains. |
| `date` | Only assets found on or after this date. |
| `format=text` | Plain newline-separated domain list. |

**Response fields:** `dom` (domain found), `found` (`YYYYMMDD`), `type`, `ip`* or `cname`*. `type` is `ast` (asset), `pphish` (potential phishing domain), or `cname` for records that resolve to a hostname rather than an IP (including some nameserver and mail-server records).

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/asm?s=acme.com&pphish"
```

---

### `/account`: watchlist, alerts, usage log, license management

Configure the watchlist, alert recipients, webhooks, the alert whitelist, the usage audit log, and key rotation. `/monitor` is a legacy alias; prefer `/account`.

**Confirm with the user before any change** (add, del, rotate). Read-only actions (`list`, `audit`) need no confirmation.

#### Watchlist

```
# add an asset (domain, company name, brand keyword, or a 6-digit card BIN)
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=add&ast=acme.com"

# list / remove
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=list"
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=del&ast=acme.com"

# enable / disable premium-marketplace monitoring for an asset (if the contract includes it)
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=add&ast=acme.com&premium=1"
```

`list` returns `[{"ast": "acme.com", "premium": false}, ...]`. An asset with its own recipients shows as `acme.com::<recipients>`.

#### Alert recipients

There are two levels:

- **License-wide recipients** get alerts for every asset. Set with `notify` and **no `ast`**:
  ```
  curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=add&notify=security@acme.com"
  curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=add&notify=https://hooks.acme.com/breachsense"
  curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=list&notify"
  curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=del&notify=security@acme.com"
  ```
- **Per-asset recipients** override the license-wide list for one asset. Put them in `ast` after `::`, comma-separated, up to 10:
  ```
  curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=add&ast=acme.com::soc@acme.com,https://hooks.acme.com/breachsense"
  ```

**Do not combine `ast=` and `notify=` in one request.** It returns an empty 200 and saves nothing. Use the `::` form for per-asset recipients.

**Technical contact.** `tech` sets the address for operational and deliverability notices, separate from breach alerts: `action=add&tech=it@acme.com`, `action=list&tech`, `action=del&tech=it@acme.com`.

**Webhook basic auth.** `action=add&creds=user:pass` sets one HTTP Basic credential used for all of the license's webhooks. To use a different credential for one webhook, embed it in that URL (`https://user:pass@hooks.acme.com/...`). Never print stored credentials back to the user.

#### `action=test`: send a test alert

Sends a sample record (with `"test": true`) to the asset's recipients. The asset must already be on the watchlist. Limit: **20 per license per day**.

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=test&ast=acme.com"
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=test&ast=acme.com::https://hooks.acme.com/breachsense"
```

```json
{
  "status": "success",
  "message": "Test alert sent",
  "remaining_today": 19,
  "delivered": { "webhooks_ok": 1, "webhooks_failed": 0, "emails_queued": 0 },
  "webhooks": [{ "url": "https://hooks.acme.com/breachsense", "status": 200 }]
}
```

Errors: `403` "Unmonitored asset", `400` if the `::` webhook isn't configured for that asset, `429` after 20 tests (with `reset_in_hours`).

Known limitation: the test currently sends basic auth only when it's embedded in the webhook URL. If the webhook uses a credential set with `creds=`, the test may get a `401` even though real alerts authenticate correctly. Say so if the user sees a 401 on a test.

#### `action=audit`: usage log

Every billed request on this license, with time, endpoint, search term, status, user agent and client IP, plus key rotations. Use it to answer "who used our queries", "why is usage high", or "is this key being used from somewhere unexpected".

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=audit&days=7"
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=audit&from=2026-10-01&to=2026-10-07"
```

`days` is 1 to 35 (default 30); `from`/`to` take `YYYY-MM-DD` or `YYYY-MM-DD HH:MM:SS`. Retention is 35 days. Returns `{"count": N, "events": [{"time", "method", "endpoint", "search", "status", "user_agent", "ip"}]}`. Summarise it (by day, endpoint, IP / user agent) rather than dumping it.

#### `action=rotate`: rotate the license key

For an exposed key. The new key is emailed to the license's recipients and is **not** returned in the response.

```
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=rotate"
```

Requirements: a paid plan (trial keys get `403`; contact support@breachsense.com), at least one recipient (else `422`), one rotation per 24 hours (else `429`). The old key stops working immediately. **Always get explicit confirmation first.**

#### The alert whitelist: stop re-reviewing credentials you've already triaged

The most common complaint about credential monitoring is noise: the same rotated password, test account or remediated credential coming back week after week. Add a whitelist entry and the alert pipeline drops matching rows before sending.

Reach for this whenever the user describes **false positives, stale records, repeat hits, alert fatigue, or re-reviewing data they've already dealt with**.

```
# suppress one exact credential pair (still alerts if that user appears with a NEW password)
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=add&whitelist&ast=user@acme.com:OldPass123"

# suppress every alert for a username
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=add&whitelist&ast=user@acme.com"

# list (returns a JSON array, [] when empty) / remove
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=list&whitelist"
curl -sL -H "lic: $BREACHSENSE_API_KEY" "https://api.breachsense.com/account?action=del&whitelist&ast=user@acme.com:OldPass123"
```

| | |
|---|---|
| Covers | `creds`, `stealer`, `combo` and `phish` alerts, on email and webhook delivery |
| Does not cover | API query results. A whitelisted credential still comes back from a direct query. This filters notifications only |
| Matching | Username matched case-insensitively, password matched exactly |
| Limit | 1,000 entries per license |
| Adding twice | Idempotent, returns `Already whitelisted: <entry>` |

**Response status:** most actions return `"status": "success"` with a `message`. `rotate` returns `"ok"` on success and `"error"` on failure.

---

## Alerts and webhook payloads

New matches for watchlist assets are sent to the recipients configured above, by email and/or webhook. Alert frequency depends on the customer's plan.

**Alert types** (the `api` field): `creds`, `combo`, `stealer`, `sessions`, `nhi`, `phish`, `radar`, `darkweb`, `docs`, `asm`.

**Webhook delivery:**
- `HTTP POST`, `Content-Type: application/json`, one request per asset per alert type. The body is a JSON array of records.
- Every record carries `api` (alert type) and `ast` (the watchlist asset that matched).
- Dates: records carry both `fnd` (unixtime) and `found` (`YYYYMMDD`). `asm` alerts carry `found` only.
- Alert records use the underlying field names, which differ in places from the API responses above (for example, `sessions` alerts use `name` / `val` rather than `cookie_name`). Key your receiver on `api` and handle missing fields.
- Basic auth from `creds=` (or embedded in the URL) is sent as an `Authorization: Basic` header.
- Failed deliveries (5xx, 408, 429, timeouts) are retried, then queued and retried on the next alert run.
- Test alerts have `"test": true`. Receivers should skip ingesting them.

---

## How to present results

Don't dump raw JSON unless asked. Apply light interpretation:

### Date awareness
- Mark records from the last 30 days as **fresh** and the last 90 days as **recent**.
- Aggregate older records: *"plus 47 older records going back to 2018"*, and offer to expand.

### Surface what matters
- If the response has plaintext passwords, **put them in the summary**. That's the point.
- For sessions, show domain, cookie name and date found prominently. Live sessions bypass MFA.
- For NHI hits, show the token type, platform and `source_type` (an `.env` file? a browser store? exposed on Shodan?).
- For `/docs`, show file name, leak date, threat actor, source type and size.
- If the status was `206`, say the result is partial and how to get the rest.

### Flag obvious patterns
Without judging specific people, call out structural patterns:
- Admin / role accounts: `admin@`, `root@`, `it@`, `helpdesk@`, `security@`, `dev@`
- The same password reused across several employees
- Very weak passwords (under 8 characters, dictionary words, the company name, `Summer2024`-style)
- Old credentials whose format suggests the current corporate convention
- NHI tokens with broad-scope prefixes (e.g. AWS root keys, admin-level GitHub PATs)

### Pretty-print
When showing JSON, format it, with high-signal fields first (user, password, source, date).

## Suggested follow-ups

After results, suggest **one** next move, the one most relevant to what the user is investigating:

- After `/stealer` hits: *"Found 47 stealer hits across 12 employees. Want me to group by employee, or narrow to the last 6 months with `date`?"*
- After plaintext passwords: *"3 of these have plaintext passwords. Want me to check `/sessions` for live cookies on the same domain?"*
- After `/darkweb` hits: *"acme.com is listed by one ransomware group. Want me to search `/docs` for what was published?"*
- After `/phish` hits: *"2 people submitted credentials to a Microsoft kit last week, and one record has an OTP, so the attacker was intercepting a live login. Want me to check `/sessions` for the same domain?"*
- After `/nhi` hits: *"Found 2 AWS access keys. Want me to pull the other `cloud_infra` tokens for this domain?"*
- After `/asm` finds lookalike domains: *"Found 3 potential phishing domains. Want me to check `/phish` for kits impersonating acme.com?"*
- After any meaningful hit on an unmonitored domain: *"Want me to add acme.com to your watchlist so new hits alert you automatically?"*
- Before paging further: *"That's page 1 of a larger result (each page is one query). Fetch the next page?"*

## Out of scope

- **No remediation advice** like *"reset all these passwords now"*. The user knows their environment.
- **No judgments about individuals.** Don't label people *"high-risk"* or *"likely compromised"*. Present the data.
- **Don't hide raw data.** The full JSON is available whenever the user asks.
- **Say what you're about to query** before running it, and confirm before any `/account` change.

## Errors

| Code | Meaning |
|---|---|
| `200` | Success (last or only page) |
| `206` | Success, more pages available |
| `400` | Bad or missing parameter (e.g. a `range` over 31 days) |
| `401` | `/account`: invalid license ("Please use a valid license.") |
| `403` | Invalid or expired license, monthly query limit reached, or the endpoint isn't in the customer's plan (`{"error": "Your plan does not include /x.", ...}`). Read the message to tell which. |
| `422` | Rotation with no recipient configured |
| `429` | Rate limited (back off and retry), or on `/asm` the monthly limit (body has `limit` / `used`) |
| `500` | Server error. Contact support@breachsense.com |

An unknown path returns an HTML page, not JSON. Check the endpoint name.

**Empty result** (`[]`): say so plainly. *"No hits for acme.com on /stealer."* Suggest one related endpoint or a wider date range.

## Test data

Searches for `example.com`, `test.com`, or any subdomain or email address at them (e.g. `s=ignore@example.com`) are not billed, so you can test an integration without using quota.
