# Breachsense MCP for any AI tool: design

Status: approved 2026-11-25 (project 1 of 2), revised after review the same day (trusted publishing, staged releases, SBOM, pinning, tool snapshot). Project 2, the hosted server, is not started.
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

- Name: `@breachsense/mcp`. The `@breachsense` scope is the personal scope of npm user `breachsense`, the account the owner signs in to (confirmed 2026-11-26). npm reserves `@<username>` for every account. The separate `breachsense.com` org is unrelated.
- Users run it pinned to the major version: `npx -y @breachsense/mcp@1`. The docs explain the pin and how to pin an exact version. Unpinned `npx` re-resolves to the newest version on every cold start, so a bad or compromised release would reach everyone at once.
- Package contents, exactly: `dist/server.mjs` (the esbuild bundle, shebang added at build time, every dependency inlined), `dist/sbom.cdx.json`, README.md, LICENSE and package.json.
- `publishConfig.access: public`. Scoped packages default to restricted.
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
- Key precedence is documented: `BREACHSENSE_API_KEY`, then `~/.config/breachsense/license.md`, then `~/.claude/breachsense/license.md` (the older location). Both files live in the home folder, not inside a project.
- On startup the server logs its version and which source supplied the key (env var name or file path, never the key) to stderr.

### SBOM

The bundle inlines its dependencies, so a customer's `npm audit` and SCA tools see none. That would come up in a customer security review. The build therefore writes a CycloneDX 1.5 SBOM, `dist/sbom.cdx.json`, generated from the esbuild metafile. It lists exactly the packages inlined into the bundle (8 today: the MCP SDK, zod, ajv and their dependencies), each with version, license and the SHA-512 hash from package-lock. Dev tooling is excluded. The SBOM ships in the npm package and is attached to every GitHub release.
- No tool, schema or behaviour changes.

### Release

No npm token exists anywhere. Publishing uses npm trusted publishing (OIDC) together with staged publishing.

Workflow `.github/workflows/mcp.yml`. The trusted publisher config matches this filename case-sensitively, so renaming it breaks releases.

- **On PRs:** typecheck, tests, build, the stdio smoke test, the packed-tarball smoke test, and a check that the committed plugin bundle matches the source. No job uses any repository secret, so fork PRs can't reach a key. The live-key check stays a manual pre-release step and never runs in CI.
- **On a tag `mcp-v*`** (GitHub-hosted runner, Node 24, `id-token: write`, no dependency cache):
  1. Upgrade npm to `^11.15.0`. Staged publishing needs 11.15.0; trusted publishing needs 11.5.1 and Node 22.14.0.
  2. Fail unless the tag version equals the package.json version.
  3. Build, then run the packed-tarball smoke test again.
  4. `npm stage publish`. Trusted publishing adds provenance automatically, so there's no `--provenance` flag.
  5. Pack `breachsense.mcpb` and create the GitHub release with `breachsense.mcpb` and `sbom.cdx.json`. This release is the Claude Desktop download.
  6. A maintainer approves the staged version with 2FA on npmjs.com (Staged Packages). Only then does it go live.

**One-time bootstrap.** Trusted publishing can only be configured on a package that already exists. The owner runs `scripts/bootstrap-npm.sh` from a logged-in npm session, so no token is ever created. The script:

- checks that the user is an owner or admin of the scope;
- runs check and the smoke tests;
- stages a throwaway `0.0.1-bootstrap.0`. On a new package, npm also shows a public `0.0.0-stage` placeholder.

It then prints the remaining steps. Their order matters:

1. **Add the trusted publisher** on the package: repository `breachsense/breachsense-plugins`, workflow `mcp.yml`, staged publish only. npm validates these fields only at publish time.
2. **Reject `0.0.1-bootstrap.0`**, only after step 1.
3. **Run `bootstrap-npm.sh verify`.** npm's docs don't say whether rejecting the only staged version of a never-published package removes the package entry. If it does, the trusted publisher loses its target. `verify` checks the registry entry. If the entry is gone, it prints the fallback:
   - turn off "disallow tokens" if it was enabled;
   - genuinely `npm publish --tag bootstrap` the `0.0.1-bootstrap.0`;
   - `npm deprecate` it;
   - re-add the trusted publisher.
4. **Turn on "Require two-factor authentication and disallow tokens".** From then on, local publishing fails, including re-running the bootstrap. To retry locally, turn it off first.
5. **Push `mcp-v1.0.0`.**
6. **Approve the staged 1.0.0 with 2FA the same day.** A new trusted publisher config expires unless its first successful publish happens within 2 days, and a version that is only staged may not count. If the config expires, delete and re-create it, then push a patch tag. That is recoverable, not fatal.

**Configuration typos are caught early.** npm checks the repository, the workflow filename (case-sensitive) and a GitHub-hosted runner only at publish time. A mismatch shows up on the tag push as a confusing `ENEEDAUTH`. Two checks catch it before then:

- PR tests (`test/version.test.ts`) assert:
  - `repository.url` is exactly `git+https://github.com/breachsense/breachsense-plugins.git`;
  - the release job lives in `.github/workflows/mcp.yml` and runs `npm stage publish` on `ubuntu-latest` with `id-token: write`;
  - no token is referenced anywhere.
- The release job's preflight step checks `repository.url` against `$GITHUB_REPOSITORY`, and the running workflow file against `mcp.yml`, with a readable error.

**Rollback.** `npm unpublish` works only for 72 hours, and a pinned major keeps resolving to the newest 1.x. The real path is therefore:

1. `npm deprecate @breachsense/mcp@<bad> "<reason>"`.
2. Release a patch version straight away.
3. Move the `latest` dist-tag if needed.

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
  3. Check that the tarball file list is exactly the five files above, so the bundle or the SBOM can't silently drop out.
  4. Check the SBOM: it is CycloneDX, lists the MCP SDK and zod, and every component has a version and a hash.
  5. Check that the installed package has no `node_modules` dependencies.
  6. Start the installed `breachsense-mcp` bin over stdio with no key. Compare the sorted tool names with the snapshot `scripts/expected-tools.json` (the stdio smoke test does the same), and check that the setup message comes back. A rename or removal fails with the exact names; an intentional change updates the snapshot in the same PR.
- One manual live check with a real key before each release, never in CI: `get_usage`, plus a free `count_only` search.

## Project 2 outline (own spec later)

- A remote Streamable HTTP entry point (`src/http.ts`) that builds the same server.
- OAuth 2.1 with a consent page where the customer enters their license key once. The key is stored encrypted, and the server issues a token bound to it. Throttling is per license.
- Decisions needed from the owner: host (prod1, prod2 or a new box), domain (for example `mcp.breachsense.com`), key storage.
- This unlocks ChatGPT connectors, claude.ai custom connectors and remote agents.
