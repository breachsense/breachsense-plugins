# Breachsense Claude Skill — Phase A scaffolding

Plan and progress for building the customer-facing Claude Skill packaged as a plugin.
Scope here is **Phase A** only (self-published marketplace via GitHub repo). Phases B
(Anthropic marketplace submit) and C (self-hosted on breachsense.com) come later.

## Plan

- [x] Survey nginx config for the real endpoint list, auth pattern, and primary query param so SKILL.md doesn't hallucinate
- [x] Create directory layout: `.claude-plugin/`, `plugins/breachsense/.claude-plugin/`, `plugins/breachsense/skills/breachsense/`
- [x] Write `.claude-plugin/marketplace.json` (top-level marketplace manifest)
- [x] Write `plugins/breachsense/.claude-plugin/plugin.json` (plugin manifest)
- [x] Write `plugins/breachsense/skills/breachsense/SKILL.md` covering all 10 endpoints + license-key handling + light interpretation rules
- [x] Write `README.md` with install instructions for env-var and memory-file patterns
- [ ] Push to a real `breachsense/breachsense-plugins` GitHub repo (manual step — scaffolding is local)
- [ ] End-to-end install test: `/plugin marketplace add` then `/plugin install`, then exercise each endpoint
- [ ] Confirm SKILL.md endpoint examples against a real license key

## Endpoint surface (from nginx.conf)

Base host: `api.breachsense.com` (also `api.breachsense.io`), HTTPS.

| Spec endpoint | nginx route line | Notes |
|---|---|---|
| `/stealer` | nginx.conf:425 | infostealer creds |
| `/combo` | nginx.conf:389 | combo lists |
| `/creds` | nginx.conf:377 | shares route group with `/api`, `/api2`, `/api3` |
| `/sessions` | nginx.conf:429 | session cookies/tokens |
| `/radar` | nginx.conf:405 | russian market hits |
| `/asm` | nginx.conf:441 | attack-surface |
| `/darkweb` | nginx.conf:385 | also `/darknet` alias |
| `/docs` | nginx.conf:258 | full-text search |
| `/monitor` and `/account` | nginx.conf:255 | already aliased — rename from #51 already shipped |
| `/nhi` | nginx.conf:433 | non-human identities |

Auth (api2.lua:1295-1298): license key passes as `?lic=<key>` query param **or** `lic: <key>` header. Skill should default to the header form.

Primary query param across endpoints: `?search=<term>` (stealer, combo, sessions, nhi, radar, darkweb). Common modifiers: `?p=N` (page), `?date=YYYYMMDD`, `?strict=1`.

## Open questions (from spec — to resolve before submit to Anthropic marketplace)

- Pagination — auto-paginate or surface "page 1 of N"?
- Within-session result caching for cross-endpoint correlation?
- During the `/monitor`→`/account` transition, does the Skill mention both or hard-cut?

## Review

Phase A scaffolding complete locally. Files ready to be committed to a new GitHub
repo `breachsense/breachsense-plugins`. End-to-end install test still pending —
needs the repo pushed first (or `/plugin marketplace add <local-path>` for a
local validation pass).
