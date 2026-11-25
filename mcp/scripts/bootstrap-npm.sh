#!/bin/bash
# One-time bootstrap for @breachsense/mcp, run by the npm org owner. No access token is created.
#
# npm trusted publishing can only be configured on a package that already exists. This script creates the
# package by STAGING a throwaway version (0.0.1-bootstrap.0) from your logged-in npm session. You then:
#   1. configure the trusted publisher on the new package (repo + mcp.yml, staged publish only),
#   2. REJECT the bootstrap staged version (never approve it),
#   3. push tag mcp-v<version>; CI stages the real release with provenance and you approve it with 2FA.
# Usage (from mcp/, after `npm login` as the owner of the breachsense org):  bash scripts/bootstrap-npm.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SCOPE=breachsense
NPM="npx -y npm@^11.15.0"
name=$(node -p "require('./package.json').name")
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
echo
echo "Staged $name@0.0.1-bootstrap.0. Next, on npmjs.com:"
echo "  1. Package settings > Trusted publishing > GitHub Actions: organization 'breachsense', repository"
echo "     'breachsense-plugins', workflow 'mcp.yml', allowed actions: staged publish only."
echo "  2. Staged Packages tab: REJECT 0.0.1-bootstrap.0."
echo "  3. Package settings > Publishing access: 'Require two-factor authentication and disallow tokens'."
v=$(node -p "require('./package.json').version")
echo "  4. Push the release tag: git tag mcp-v$v && git push origin mcp-v$v"
