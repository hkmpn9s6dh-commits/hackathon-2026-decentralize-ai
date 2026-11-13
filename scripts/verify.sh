#!/usr/bin/env bash
# Everything a reviewer can re-run. No network, no keys, no fixtures to fetch.
#   bash scripts/verify.sh
set -uo pipefail

pass=0
fail=0
note() { printf '%6s  %s\n' "$1" "$2"; }
check() {
  local name="$1"; shift
  if "$@" > /tmp/receipts-step.log 2>&1; then
    note "PASS" "$name"; pass=$((pass + 1))
  else
    note "FAIL" "$name"; sed 's/^/        /' /tmp/receipts-step.log | tail -25; fail=$((fail + 1))
  fi
}

echo "Receipts — verification"
echo

check "typecheck (tsc --noEmit)" npm run typecheck
check "unit tests (30 assertions)" npm test
check "build (tsc + vite)" npm run build
check "e2e against dist (31 checks)" node scripts/e2e.mjs

# AC-12: nothing in the shipped bundle may talk to a third party.
# Vite's modulepreload polyfill legitimately calls fetch() on same-origin <link> hrefs,
# so the check is for *external* URLs and for the streaming APIs we would never need.
if grep -rIonE "https?://[a-zA-Z0-9.-]+" dist/assets/*.js | grep -vE "w3\.org|localhost|127\.0\.0\.1" > /tmp/receipts-net.log 2>&1; then
  note "FAIL" "no external URLs in the built bundle"
  sed 's/^/        /' /tmp/receipts-net.log | head -10
  fail=$((fail + 1))
else
  note "PASS" "no external URLs in the built bundle"
  pass=$((pass + 1))
fi

if grep -rInE "XMLHttpRequest|new WebSocket|EventSource|navigator\.sendBeacon" dist/assets/*.js > /tmp/receipts-net2.log 2>&1; then
  note "FAIL" "no streaming/beacon APIs in the built bundle"
  sed 's/^/        /' /tmp/receipts-net2.log | head -5
  fail=$((fail + 1))
else
  note "PASS" "no streaming/beacon APIs in the built bundle"
  pass=$((pass + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
