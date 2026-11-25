# Breachsense MCP for any AI tool: design

Status: approved 2026-11-25 (project 1 of 2). Project 2, the hosted server, is not started.
Date: 2026-11-25

## Goal

Let customers use the Breachsense MCP server from any AI tool, not only Claude Code.

| Tool group | Needs | Covered by |
|---|---|---|
| Desktop and editor apps: Claude Desktop, Cursor, VS Code/Copilot, Windsurf, Codex CLI, Gemini CLI, Cline, Zed | a local stdio server they can start with one command | project 1 (this spec) |
| Agent frameworks (Claude Agent SDK, OpenAI Agents SDK, LangChain and others) | stdio for local agents, HTTPS for remote agents | project 1 for stdio; project 2 for remote |
| ChatGPT, claude.ai web and mobile | a hosted HTTPS MCP endpoint with OAuth | project 2 (own spec) |

The server code is already client-neutral: plain MCP over stdio, written with the official SDK. Distribution is what limits it, because users have to clone the repo today.

## Project 1: npm package and setup guides for each tool

### Package

- Name: `@breachsense/mcp` in the npm org `breachsense` (created 2026-11-25, owner account support@breachsense.com).
- Users run it with: `npx -y @breachsense/mcp`.
- Package contents: the esbuild bundle `dist/server.mjs` (shebang, every dependency inlined), plus README.md and LICENSE.
  - Runtime dependencies are empty, so `npx` downloads one small tarball and installs nothing else.
  - The SDK and zod move to devDependencies.
- `bin`: `breachsense-mcp` points to `dist/server.mjs`.
- `engines.node >=20`, unchanged.
- Version: 1.0.0.
  - `src/version.ts` must equal `package.json`, enforced by a test.
  - The .mcpb manifest already takes its version from package.json at build time.
- The Claude Code plugin keeps its committed copy, `plugins/breachsense/mcp/server.mjs`, so the plugin still works without npm.

### Code changes

- `SETUP_MESSAGE` no longer names one client. It says to set `BREACHSENSE_API_KEY` in the tool's MCP server config (Claude Desktop: extension settings), or to create `~/.config/breachsense/license.md`.
- The `~/.claude/breachsense/license.md` fallback stays, for existing users.
- No tool, schema or behaviour changes.

### Release

GitHub Actions workflow `.github/workflows/release-mcp.yml`, triggered by a tag `mcp-v*`:

1. `npm ci`, `npm run check` (typecheck, tests, build), then the packed-tarball smoke test.
2. Fail unless the tag version equals the package.json version.
3. `npm publish --provenance --access public` using the repo secret `NPM_TOKEN`, a granular token scoped to `@breachsense`.
4. Pack `breachsense.mcpb` with `@anthropic-ai/mcpb@2.1.2` and attach it to a GitHub release for the tag. This is the Claude Desktop download location.

Nothing publishes until the PR is merged, `NPM_TOKEN` is set, and the owner pushes the first tag.

### Docs

- `mcp/README.md` is both the npm package page and the setup guide for each tool. It covers:
  - the license key: the file is recommended because it keeps the key out of every tool's config;
  - copy-paste configs for Claude Code, Claude Desktop, Cursor, VS Code/Copilot (a secure `promptString` input), Windsurf, Codex CLI (`env_vars` passthrough), Gemini CLI, Cline and Zed;
  - agent framework examples for the OpenAI Agents SDK, the Claude Agent SDK and the MCP TypeScript SDK;
  - the tool list with the cost of each tool.
- The root README is retitled "Breachsense for AI tools". Its MCP section becomes a table, one row per tool, that links to `mcp/README.md`.
- ChatGPT and claude.ai are listed as needing the hosted server, which is planned.
- The Claude Code plugin goes to 1.5.0, because its bundled server changed (neutral setup message, version 1.0.0).

### Testing

- The existing vitest suite.
- New test: VERSION matches package.json.
- New `scripts/smoke-pack.mjs`, which runs as follows:
  1. `npm pack`.
  2. Install the tarball into a fresh temporary directory.
  3. Start the installed `breachsense-mcp` bin over stdio with no key and check that 18 tools are listed and that the setup message comes back.
  4. Check that the installed package has no `node_modules` dependencies.
- One live check with a real key before the first release: `get_usage`, plus a free `count_only` search.

## Project 2 outline (own spec later)

- A remote Streamable HTTP entry point (`src/http.ts`) that builds the same server.
- OAuth 2.1 with a consent page where the customer enters their license key once. The key is stored encrypted, and the server issues a token bound to it. Throttling is per license.
- Decisions needed from the owner: host (prod1, prod2 or a new box), domain (for example `mcp.breachsense.com`), key storage.
- This unlocks ChatGPT connectors, claude.ai custom connectors and remote agents.
