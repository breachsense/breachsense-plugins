# Breachsense Plugin for Claude

Query the [Breachsense](https://breachsense.com) breach-data platform from Claude Code, Claude Desktop, or any tool that supports Claude plugins.

This plugin gives Claude knowledge of all **10 Breachsense API endpoints** — stealer logs, combo lists, sessions, dark-web leaks, ASM, NHI, and more — so you can ask in natural language and get useful, interpreted results instead of raw JSON.

## Install

```
/install-plugin https://github.com/breachsense/breachsense-plugins
```

## Set your license key

The skill auto-detects the license key from one of two places (in order):

### Option 1 — environment variable (recommended)

```bash
export BREACHSENSE_API_KEY=your-license-key-here
```

Add it to your shell rc file (`~/.bashrc`, `~/.zshrc`) so it's set in every session.

### Option 2 — memory file

Create `~/.claude/breachsense/license.md` containing just your key:

```bash
mkdir -p ~/.claude/breachsense
echo 'your-license-key-here' > ~/.claude/breachsense/license.md
```

Use this if you don't want to manage shell environment variables.

## Try it

After install, just ask Claude:

- *"Show me stealer logs for acme.com from the last 30 days."*
- *"Any session tokens for our domain on Discord?"*
- *"What's exposed for acme.com on ransomware leak sites?"*
- *"Find leaked AWS keys associated with acme.com."*
- *"Search leaked documents for mentions of acme.com."*
- *"Add acme.com to my watchlist and notify security@acme.com."*
- *"Show me potential phishing domains for acme.com."*

## What you get

Claude will:
- Run the right Breachsense endpoint for your question
- Surface plaintext passwords, fresh hits, and admin-account patterns up front
- Flag leaked API keys and tokens by platform (AWS, GitHub, OpenAI, etc.) and source type
- Highlight active session tokens that could bypass MFA
- Suggest useful follow-up queries (cross-checks across endpoints, watchlist setup, date filters)
- Show raw JSON on request

What it **won't** do:
- Tell you to "reset all passwords now" or make remediation decisions for you
- Label specific people as "high-risk"
- Hide data — full responses are always one ask away
- Run destructive operations (key rotation, watchlist changes) without your confirmation

## Endpoints covered

| Endpoint | Purpose |
|---|---|
| `/stealer` | Infostealer credentials (Redline, Lumma, StealC, etc.) |
| `/combo` | Combo lists from hacking forums |
| `/creds` | Third-party breach credentials |
| `/sessions` | Session cookies & auth tokens (bypasses MFA) |
| `/nhi` | Non-human identities — API keys, OAuth tokens, service creds |
| `/darkweb` | Ransomware leak site mentions |
| `/radar` | Dark-web market listings (Russian Market, etc.) |
| `/docs` | Full-text search across leaked documents |
| `/asm` | Attack surface management — subdomains, exposed services, phishing domains |
| `/account` | Watchlist management, webhook alerts, test alerts, license rotation |

## Get a license key

Sign up at [breachsense.com](https://breachsense.com).

## Support

- Issues: https://github.com/breachsense/breachsense-plugins/issues
- Email: info@breachsense.com
