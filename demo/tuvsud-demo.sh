#!/usr/bin/env bash
#
# Breachsense demo — tuvsud.com walkthrough
# -----------------------------------------
# Prereqs:
#   1. Run in an environment with outbound access to api.breachsense.com
#      (web sessions: set Network access = Full, or Custom + api.breachsense.com).
#   2. Export your license key first:
#        export BREACHSENSE_API_KEY=<your-key>
#
# Each call throttles to respect the 1 req/sec rate limit.

set -euo pipefail

: "${BREACHSENSE_API_KEY:?Set BREACHSENSE_API_KEY before running}"

API="https://api.breachsense.com"
TARGET="tuvsud.com"
# "Last week" relative to today; adjust as needed (YYYYMMDD).
SINCE="$(date -u -d '7 days ago' +%Y%m%d 2>/dev/null || date -u -v-7d +%Y%m%d)"

call() {
  local label="$1" url="$2"
  echo "### ${label}"
  echo "GET ${url}"
  curl -sL -H "lic: ${BREACHSENSE_API_KEY}" "${url}" -w '\n[HTTP %{http_code}]\n'
  echo
  sleep 1.1   # stay under 1 req/sec
}

echo "== Breachsense demo for ${TARGET} (since ${SINCE}) =="
echo

# 1. Dark-web forum / market mentions in the last week (the question asked).
call "radar — dark-web forum/market mentions (last 7 days)" \
  "${API}/radar?s=${TARGET}&date=${SINCE}&count"

# 2. Cross-check: infostealer credentials for the same domain.
call "stealer — infostealer credentials" \
  "${API}/stealer?s=${TARGET}&count"

# 3. Cross-check: active session cookies/tokens (these bypass MFA).
call "sessions — active session tokens" \
  "${API}/sessions?s=${TARGET}&count"
