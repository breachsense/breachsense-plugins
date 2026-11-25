#!/bin/bash
# One-time bootstrap for @breachsense/mcp, run by the npm org owner. No access token is created.
#
# npm trusted publishing can only be configured on a package that already exists. This script creates the
# package by STAGING a throwaway version (0.0.1-bootstrap.0) from your logged-in npm session, then prints
# the remaining steps in the only safe order (trusted publisher BEFORE reject, verify AFTER reject).
#
# Usage (from mcp/, after `npm login` as the owner):
#   bash scripts/bootstrap-npm.sh          stage the bootstrap version
#   bash scripts/bootstrap-npm.sh verify   after rejecting it: confirm the package entry still exists
set -euo pipefail
cd "$(dirname "$0")/.."

SCOPE=breachsense
NPM="npx -y npm@^11.15.0"
name=$(node -p "require('./package.json').name")

if [ "${1:-}" = "verify" ]; then
  # A never-published package whose only staged version was rejected might lose its registry entry,
  # and with it the trusted publisher config. Check before pushing the release tag.
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://registry.npmjs.org/@breachsense%2fmcp")
  if [ "$code" = "200" ]; then
    echo "OK: $name still exists on the registry (HTTP 200). Check the trusted publisher is still listed in package settings, then push the tag."
    exit 0
  fi
  echo "PROBLEM: $name is gone from the registry (HTTP $code), so the trusted publisher has no target."
  echo "Fallback: turn OFF 'disallow tokens' if you enabled it and run 'npm login'. Then, from a copy whose version"
  echo "is 0.0.1-bootstrap.0, run '$NPM publish --tag bootstrap' and"
  echo "'$NPM deprecate $name@0.0.1-bootstrap.0 \"bootstrap placeholder, do not use\"'."
  echo "Then re-add the trusted publisher, run this verify again, and continue."
  exit 1
fi
[ "$name" = "@$SCOPE/mcp" ] || { echo "package name is $name, expected @$SCOPE/mcp"; exit 1; }

user=$($NPM whoami) || { echo "not logged in: run npm login first"; exit 1; }
role=$($NPM org ls "$SCOPE" "$user" --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(r[process.argv[1]]||"")})' "$user")
case "$role" in owner|admin) echo "npm user $user is $role of @$SCOPE";; *) echo "npm user $user is not an owner/admin of the @$SCOPE org (role: '${role:-none}'). Stop: check which org you own."; exit 1;; esac

if $NPM view "$name" name >/dev/null 2>&1; then echo "$name already exists on npm; bootstrap not needed."; exit 0; fi

npm ci --no-audit --no-fund
npm run check
npm run smoke:pack

work=$(mktemp -d)
cp package.json README.md LICENSE "$work/" && mkdir -p "$work/dist" && cp dist/server.mjs dist/sbom.cdx.json "$work/dist/"
(cd "$work" && npm pkg set version=0.0.1-bootstrap.0 && $NPM stage publish --tag bootstrap)
v=$(node -p "require('./package.json').version")
cat <<NEXT

Staged $name@0.0.1-bootstrap.0. Do the rest IN THIS ORDER, all on the same day:

 1. npmjs.com > $name > Settings > Trusted publishing > GitHub Actions:
      organization 'breachsense', repository 'breachsense-plugins', workflow 'mcp.yml' (exact, lower case),
      allowed actions: staged publish only. npm validates these only when CI publishes, not on save.
 2. Staged Packages tab: REJECT 0.0.1-bootstrap.0 (only after step 1).
 3. Run: bash scripts/bootstrap-npm.sh verify
      It confirms the package entry survived the reject. If it did not, it prints the fallback.
 4. Package settings > Publishing access: "Require two-factor authentication and disallow tokens".
      From then on local publishing (including re-running this script) fails. If you must retry locally,
      turn this off first and back on afterwards.
 5. Push the release tag:  git tag mcp-v$v && git push origin mcp-v$v
 6. When the GitHub Actions run is green, approve the staged $v with 2FA in Staged Packages THE SAME DAY.
      A new trusted publisher must complete its first publish within 2 days; a version left staged may not
      count. If the config expires, delete and re-create it on step 1's page, then push a new patch tag.
NEXT
