# Breachsense MCP server

Search [Breachsense](https://breachsense.com) breach data from any AI tool that supports the Model Context Protocol (MCP): stealer logs, combo lists, breach credentials, phishing captures, session cookies, leaked secrets, ransomware leaks, forum mentions, leaked documents and your attack surface.

Every tool runs the same server:

```
npx -y @breachsense/mcp@1
```

It needs Node.js 20 or newer and your Breachsense license key.

**Pin the version.** The configs below use `@breachsense/mcp@1`, so you get fixes but never a new major version without choosing it. Unpinned `npx -y @breachsense/mcp` fetches whatever is newest on every cold start. For locked-down environments, pin an exact release (for example `@breachsense/mcp@1.0.0`) and update deliberately. Every release is published from GitHub Actions with npm provenance. Each release also ships a CycloneDX SBOM (`dist/sbom.cdx.json` in the package, `sbom.cdx.json` on the GitHub release) listing every library bundled into the server, because the package itself has no npm dependencies for your SCA tools to see.

## 1. Add your license key

Pick one:

- **License file (recommended).** Every tool finds it, and the key stays out of your AI tool's config files:

  ```bash
  mkdir -p ~/.config/breachsense
  echo 'your-license-key' > ~/.config/breachsense/license.md
  chmod 600 ~/.config/breachsense/license.md
  ```

  With the file in place, you can leave out the `env` / `BREACHSENSE_API_KEY` lines in the configs below.

- **Environment variable.** Set `BREACHSENSE_API_KEY` in the server's `env` block, as the examples below show.

The server takes the first key it finds, in this order:

1. the `BREACHSENSE_API_KEY` environment variable
2. `~/.config/breachsense/license.md`
3. `~/.claude/breachsense/license.md` (older location, still supported)

Both files are in your home folder, never inside a project, so they can't end up in a repository. On startup, the server logs which source it used to stderr, without the key (for example `license key from /Users/you/.config/breachsense/license.md`). Your AI tool's MCP log shows this line. If no key is found, the server still starts. Each tool then explains how to add one, and no query is sent.

## 2. Connect your AI tool

### Claude Code

Install the plugin. It bundles this server together with the Breachsense skill:

```
/plugin marketplace add https://github.com/breachsense/breachsense-plugins
/plugin install breachsense@breachsense
```

Or add only the server: `claude mcp add breachsense -s user -- npx -y @breachsense/mcp@1`

### Claude Desktop

Download `breachsense.mcpb` from the [latest release](https://github.com/breachsense/breachsense-plugins/releases), open it, and enter your key when asked. Desktop stores the key in your system keychain.

You can also add the server by hand. Open Settings, then Developer, then Edit Config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "breachsense": {
      "command": "npx",
      "args": ["-y", "@breachsense/mcp@1"],
      "env": { "BREACHSENSE_API_KEY": "your-license-key" }
    }
  }
}
```

### Cursor

Use `~/.cursor/mcp.json` for all projects, or `.cursor/mcp.json` in one project:

```json
{
  "mcpServers": {
    "breachsense": {
      "command": "npx",
      "args": ["-y", "@breachsense/mcp@1"],
      "env": { "BREACHSENSE_API_KEY": "your-license-key" }
    }
  }
}
```

### VS Code (GitHub Copilot agent mode)

Add this to `.vscode/mcp.json`, or run **MCP: Open User Configuration** to make it available everywhere. VS Code asks for the key once and stores it securely:

```json
{
  "inputs": [
    { "type": "promptString", "id": "breachsense-key", "description": "Breachsense license key", "password": true }
  ],
  "servers": {
    "breachsense": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@breachsense/mcp@1"],
      "env": { "BREACHSENSE_API_KEY": "${input:breachsense-key}" }
    }
  }
}
```

### Windsurf

Add this to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "breachsense": {
      "command": "npx",
      "args": ["-y", "@breachsense/mcp@1"],
      "env": { "BREACHSENSE_API_KEY": "your-license-key" }
    }
  }
}
```

### OpenAI Codex CLI

Add this to `~/.codex/config.toml`. `env_vars` passes your shell's `BREACHSENSE_API_KEY` through, so the key never goes in the file:

```toml
[mcp_servers.breachsense]
command = "npx"
args = ["-y", "@breachsense/mcp@1"]
env_vars = ["BREACHSENSE_API_KEY"]
```

### Gemini CLI

Add this to `~/.gemini/settings.json`. `$BREACHSENSE_API_KEY` is read from your shell:

```json
{
  "mcpServers": {
    "breachsense": {
      "command": "npx",
      "args": ["-y", "@breachsense/mcp@1"],
      "env": { "BREACHSENSE_API_KEY": "$BREACHSENSE_API_KEY" }
    }
  }
}
```

### Cline

Open the MCP Servers panel, then Configure, and add this to `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "breachsense": {
      "command": "npx",
      "args": ["-y", "@breachsense/mcp@1"],
      "env": { "BREACHSENSE_API_KEY": "your-license-key" }
    }
  }
}
```

### Zed

Add this to your Zed `settings.json` (the **zed: open settings file** command opens it):

```json
{
  "context_servers": {
    "breachsense": {
      "command": "npx",
      "args": ["-y", "@breachsense/mcp@1"],
      "env": { "BREACHSENSE_API_KEY": "your-license-key" }
    }
  }
}
```

### Any other MCP client

Start it as a stdio server with command `npx` and args `["-y", "@breachsense/mcp@1"]`, and set `BREACHSENSE_API_KEY`. To skip the npx download on every start, install it globally (`npm i -g @breachsense/mcp@1`) and use the command `breachsense-mcp`.

### Agent frameworks

OpenAI Agents SDK (Python):

```python
from agents import Agent, Runner
from agents.mcp import MCPServerStdio

async with MCPServerStdio(params={"command": "npx", "args": ["-y", "@breachsense/mcp@1"]}) as breachsense:
    agent = Agent(name="Analyst", instructions="Investigate exposure.", mcp_servers=[breachsense])
    result = await Runner.run(agent, "Count stealer log hits for acme.com")
```

Claude Agent SDK (Python):

```python
from claude_agent_sdk import ClaudeAgentOptions, query

options = ClaudeAgentOptions(
    mcp_servers={"breachsense": {"command": "npx", "args": ["-y", "@breachsense/mcp@1"]}},
    allowed_tools=["mcp__breachsense__*"],
)
async for message in query(prompt="Count stealer log hits for acme.com", options=options):
    print(message)
```

MCP TypeScript SDK:

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: "npx", args: ["-y", "@breachsense/mcp@1"] }));
const result = await client.callTool({ name: "search_stealer_logs", arguments: { query: "acme.com", count_only: true } });
```

These examples read the key from the license file. To use the environment variable instead, pass `env` with `BREACHSENSE_API_KEY` (and `PATH`, because some SDKs replace the whole environment).

### ChatGPT and claude.ai

These connect only to hosted MCP servers. A hosted Breachsense endpoint is planned. Until it ships, use one of the tools above.

## Tools

| Tool | What it does | Cost |
|---|---|---|
| `search_stealer_logs` | Infostealer credentials | 1 query per page |
| `search_combo_lists` | Combo lists from hacking forums | 1 query per page |
| `search_breach_credentials` | Third-party breach and database dump credentials | 1 query per page |
| `search_phishing_captures` | Credentials captured by phishing kits | 1 query per page |
| `search_session_cookies` | Session cookies and auth tokens | 1 query per page |
| `search_leaked_secrets` | API keys, OAuth tokens, service credentials | 1 query per page |
| `search_ransomware_leaks` | Ransomware leak site mentions | 1 query per page |
| `search_forum_mentions` | Hacker forums and underground markets | 1 query per page |
| `search_documents` | Full-text search across leaked documents | 1 query per page |
| `download_document` | Fetch one leaked document | 1 query |
| `get_attack_surface` | Subdomains, mail servers, lookalike and phishing domains for a watched domain | 1 query per page |
| `check_credential_exposure` | One domain across stealer logs, combo lists, breaches and phishing captures | 4 queries |
| `get_usage` | Queries used and remaining | free |
| `get_monitoring_setup` | Watchlist, alert recipients, webhooks | free |
| `manage_watchlist`, `manage_alert_recipients`, `manage_whitelist`, `send_test_alert` | Change monitoring settings (your tool asks before running them) | free |

Searches with `count_only` are free, and so are searches for `example.com` and `test.com`, so you can test your setup at no cost.

## Support

- Issues: https://github.com/breachsense/breachsense-plugins/issues
- Email: support@breachsense.com
- License key: [breachsense.com](https://breachsense.com)
