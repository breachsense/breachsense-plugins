#!/bin/bash
# One-time bootstrap for a NEW npm package name, run by the npm scope owner. No access token is created.
# @breachsense/mcp was bootstrapped on 2026-11-25/26, so for it this script just says "already exists".
#
# npm trusted publishing can only be configured on a package that already exists. This script creates the
# package by staging a throwaway version (0.0.1-bootstrap.0) from your logged-in npm session, then prints
# the remaining steps. Learned the hard way (2026-11-25):
#   - NEVER reject the bootstrap version. While npm's 0.0.0-stage placeholder is the only other version,
#     rejecting deletes the whole package AND its trusted publisher config. Approve it, then deprecate it.
#   - Until something is approved, the public registry returns 404 for the package; npmjs.com is the only
#     place that shows the placeholder, the staged version and the trusted publisher.
#   - A staged version shows "Validating" for about 2 minutes before Approve becomes clickable.
#   - `npm login` sessions expire within hours; an expired one shows up as E404 on writes, E401 on whoami.
#   - deprecate and stage approve ask for browser 2FA: run them in your own terminal and press ENTER.
#
# Usage (from mcp/, after `npm login` as the scope owner):  bash scripts/bootstrap-npm.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SCOPE=breachsense
NPM="npx -y npm@11.21.3"   # needs >= 11.15.0 for `npm stage`; 11.21.3 is the version this was done with
name=$(node -p "require('./package.json').name")
[ "$name" = "@$SCOPE/mcp" ] || { echo "package name is $name, expected @$SCOPE/mcp"; exit 1; }

user=$($NPM whoami) || { echo "not logged in (or the session expired): run npm login first"; exit 1; }
role=$($NPM org ls "$SCOPE" "$user" --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(r[process.argv[1]]||"")})' "$user")
case "$role" in owner|admin) echo "npm user $user is $role of @$SCOPE";; *) echo "npm user $user is not an owner/admin of @$SCOPE (role: '${role:-none}'). Stop: check which scope you own."; exit 1;; esac

if $NPM view "$name" name >/dev/null 2>&1; then echo "$name already exists on npm; bootstrap not needed. Releases: push tag mcp-v<version>."; exit 0; fi

npm ci --no-audit --no-fund
npm run check
npm run smoke:pack

work=$(mktemp -d)
cp package.json README.md LICENSE "$work/" && mkdir -p "$work/dist" && cp dist/server.mjs dist/sbom.cdx.json "$work/dist/"
(cd "$work" && npm pkg set version=0.0.1-bootstrap.0 && $NPM stage publish --tag bootstrap)
v=$(node -p "require('./package.json').version")
cat <<NEXT

Staged $name@0.0.1-bootstrap.0. Do the rest IN THIS ORDER, the same day, without logging out:

 1. npmjs.com > Staged Packages: wait for "Validating" to finish (~2 min), then APPROVE 0.0.1-bootstrap.0.
      Do NOT reject it: that deletes the package. Approving makes the package real.
 2. Deprecate it (press ENTER, finish 2FA in the browser):
      $NPM deprecate $name@0.0.1-bootstrap.0 "bootstrap placeholder, do not use"
 3. npmjs.com > $name > Settings > Trusted publishing > GitHub Actions:
      organization 'breachsense', repository 'breachsense-plugins', workflow 'mcp.yml' (exact, lower case),
      allowed actions: staged publish only. A new config must see a publish within ~2 days or it expires.
 4. Push the release tag:  git tag mcp-v$v && git push origin mcp-v$v
      CI stages $v with provenance and prints its stage id.
 5. Approve it (or use Staged Packages on npmjs.com):
      $NPM stage approve <stage id from the CI log>
 6. npmjs.com > $name > Settings > Publishing access:
      "Require two-factor authentication and disallow bypass 2fa tokens". Do this LAST: it blocks steps 2 and 5.
NEXT
