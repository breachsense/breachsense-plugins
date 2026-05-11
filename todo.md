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
- [x] Full rewrite of SKILL.md with complete API documentation (all params, response fields, NHI filters, account actions, webhooks, test alerts, license rotation)
- [ ] Push to `breachsense/breachsense-plugins` GitHub repo
- [ ] End-to-end install test: install plugin, then exercise each endpoint
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

Auth (api2.lua:1295-1298): license key passes as `?lic=<key>` query param **or** `lic: <key>` header. Skill defaults to the header form.

Primary query param across endpoints: `?s=<term>` (alias: `?search=<term>`). Common modifiers: `?p=N` (page), `?date=YYYYMMDD`, `?count`, `?unixtime`.

## Changelog

### v1.0.0 (2026-05-12)
- Complete SKILL.md rewrite with all 10 endpoints fully documented
- Added response field tables for every endpoint
- Added NHI filter parameters (category, platform, prefix, source_type, token_type)
- Added ASM filter parameters (assets, pphish)
- Added Account endpoint actions: add, del, list, test, rotate
- Added webhook payload format documentation
- Added test alert feature with daily limits and response format
- Added license key rotation documentation with safety warnings
- Added complete HTTP status code table
- Created top-level `.claude-plugin/marketplace.json`
- Updated plugin.json with author, MIT license, expanded keywords
- Updated README with endpoint table and expanded examples
