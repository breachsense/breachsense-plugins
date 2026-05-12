# Breachsense Plugin for Claude

Query the [Breachsense](https://breachsense.com) breach-data platform from Claude Code, Claude Desktop, or any tool that supports Claude plugins.

The plugin loads all 10 Breachsense API endpoints (stealer logs, combo lists, sessions, dark-web, ASM, NHI, and the rest) into Claude. Ask in natural language; get interpreted results back instead of raw JSON.

## Install

Inside Claude Code:

```
/plugin marketplace add https://github.com/breachsense/breachsense-plugins
/plugin install breachsense@breachsense
/reload-plugins
```

The HTTPS URL form works on any machine. The shorthand `breachsense/breachsense-plugins` form clones via SSH and needs a GitHub SSH key configured locally.

Pick **"Install for you (user scope)"** when prompted so the skill is available across all your projects.

### Verify the skill loaded

Run `/skills` inside Claude Code. You should see `breachsense:query` listed as `on`.

If `/reload-plugins` reports `0 skills`, that's a cosmetic display bug, not a real failure. Trust `/skills`.

## Set your license key

The skill checks two places, in order:

### Option 1: environment variable (recommended)

```bash
echo 'export BREACHSENSE_API_KEY=your-license-key-here' >> ~/.zshrc
source ~/.zshrc
```

Restart your Claude Code session afterward. Claude Code reads the environment at startup, so a running session won't pick up the new variable.

### Option 2: memory file

```bash
mkdir -p ~/.claude/breachsense
echo 'your-license-key-here' > ~/.claude/breachsense/license.md
chmod 600 ~/.claude/breachsense/license.md
```

Use this if you'd rather not touch your shell config.

## Try it

After install, ask Claude things like:

- *"Show me stealer logs for acme.com from the last 30 days."*
- *"Any session tokens for our domain on Discord?"*
- *"What's exposed for acme.com on ransomware leak sites?"*
- *"Find leaked AWS keys associated with acme.com."*
- *"Search leaked documents for mentions of acme.com."*
- *"Add acme.com to my watchlist and notify security@acme.com."*
- *"Show me potential phishing domains for acme.com."*

## What you get

Claude will:
- Pick the right Breachsense endpoint for your question
- Pull plaintext passwords, fresh hits, and admin-account patterns to the top of the summary
- Flag leaked API keys by platform (AWS, GitHub, OpenAI, etc.) and source type
- Highlight live session tokens (these bypass MFA)
- Suggest the next useful query (cross-checks, date filters, watchlist setup)
- Show raw JSON if you ask

What it won't do:
- Tell you to "reset all passwords now" or make remediation decisions for you
- Label specific people as "high-risk"
- Hide data. Full responses are one ask away
- Run destructive operations (key rotation, watchlist changes) without your confirmation

## Endpoints covered

| Endpoint | Purpose |
|---|---|
| `/stealer` | Infostealer credentials (Redline, Lumma, StealC, etc.) |
| `/combo` | Combo lists from hacking forums |
| `/creds` | Third-party breach credentials and unsecured database dumps |
| `/sessions` | Session cookies and auth tokens (bypass MFA) |
| `/nhi` | Non-human identities: API keys, OAuth tokens, service creds |
| `/darkweb` | Ransomware leak site mentions |
| `/radar` | Hacker forums and underground marketplaces where credentials are traded or sold |
| `/docs` | Full-text search (any string) across leaked ransomware files, third-party breaches, and unsecured database dumps |
| `/asm` | Attack surface: subdomains, exposed services, phishing domains |
| `/account` | Watchlist, webhook alerts, test alerts, license rotation |

## Updating the plugin

When a new version ships:

```
/plugin marketplace update breachsense
/plugin install breachsense@breachsense
/reload-plugins
```

## Troubleshooting

**"Marketplace file not found"**
The repo is missing `.claude-plugin/marketplace.json` at the root, or your local marketplace cache is stale. Run `/plugin marketplace update breachsense`.

**Plugin installs but `/skills` shows nothing**
Make sure Claude Code is on a recent version: `claude --version`, then `npm install -g @anthropic-ai/claude-code@latest` to update. Then uninstall, update the marketplace, and reinstall:

```
/plugin uninstall breachsense@breachsense
/plugin marketplace update breachsense
/plugin install breachsense@breachsense
/reload-plugins
```

**Validation error on install**
Check the `/plugin` UI's **Errors** tab for the exact reason. Most issues are schema mismatches in `plugin.json` (e.g. `author` must be an object with `name`/`email`/`url`, not a string).

**SSH clone fails**
Claude Code clones via SSH (`git@github.com:...`) when you use the shorthand form. Confirm your GitHub SSH key works: `ssh -T git@github.com`. If you don't have SSH set up, use the HTTPS form: `/plugin marketplace add https://github.com/breachsense/breachsense-plugins.git`.

## Get a license key

Sign up at [breachsense.com](https://breachsense.com).

## Support

- Issues: https://github.com/breachsense/breachsense-plugins/issues
- Email: support@breachsense.com
