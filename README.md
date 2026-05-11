# Breachsense Plugins for Claude

Query the Breachsense breach-data platform from Claude Code, Claude Desktop, or any tool that supports Claude Code plugins.

This plugin gives Claude knowledge of all 10 Breachsense API endpoints — stealer logs, combo lists, sessions, dark-web, ASM, NHI, and more — so you can ask in natural language and get useful, interpreted results instead of raw JSON.

## Install

```
/plugin marketplace add breachsense/breachsense-plugins
/plugin install breachsense@breachsense-plugins
```

## Set your license key

The skill auto-detects the license key from one of two places (in order):

### Option 1 — environment variable (recommended)

```
export BREACHSENSE_API_KEY=your-license-key-here
```

Add it to your shell rc file (`~/.bashrc`, `~/.zshrc`) so it's set in every session.

### Option 2 — memory file

Create `~/.claude/breachsense/license.md` containing just your key:

```
mkdir -p ~/.claude/breachsense
echo 'your-license-key-here' > ~/.claude/breachsense/license.md
```

Use this if you don't want to manage shell environment variables.

## Try it

After install, just ask Claude:

- *"Show me stealer logs for acme.com from the last 30 days."*
- *"Any session tokens for our domain on Discord?"*
- *"What's exposed for acme.com on ransomware leak sites?"*
- *"Add acme.com to my watchlist."*

## What you get

Claude will:
- Run the right Breachsense endpoint for your question
- Surface plaintext passwords, fresh hits, and admin-account patterns up front
- Suggest useful follow-up queries (cross-checks across endpoints, watchlist setup, date filters)
- Show raw JSON on request

What it **won't** do:
- Tell you to "reset all passwords now" or make remediation decisions for you
- Label specific people as "high-risk"
- Hide data — full responses are always one ask away

## Endpoints covered

`/stealer`, `/combo`, `/creds`, `/sessions`, `/radar`, `/asm`, `/darkweb`, `/docs`, `/account` (and `/monitor` alias), `/nhi`.

## Get a license key

Sign up at [breachsense.com](https://breachsense.com).

## Support

- Issues: https://github.com/breachsense/breachsense-plugins/issues
- Email: info@breachsense.com
