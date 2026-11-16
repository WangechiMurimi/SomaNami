#!/usr/bin/env bash
# Tests the VM's idle-deallocate script (#201) offline, with no Azure needed.
#
# The script is extracted from cloud-init.yaml, so this tests exactly what the
# VM runs. Fixture log lines stand in for journalctl, and a Node mock stands in
# for the instance metadata service (IMDS) and Azure Resource Manager.
#
# Usage: npm run test:idle
# Needs: bash, node and curl on PATH.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/cloud-init.yaml"
MOCK_PORT="${MOCK_PORT:-18435}"

# Test-only values. The marker stands in for prompt text: if a log line ever
# carried it, the script must still not print it.
NOW=1700000000
TOKEN="test-managed-identity-token-$RANDOM$RANDOM"
MARKER="LEARNER-PROMPT-$RANDOM$RANDOM"
VM_ID="/subscriptions/00000000-1111-2222-3333-444444444444/resourceGroups/somanami-llm-rg/providers/Microsoft.Compute/virtualMachines/somanami-ollama"

die() {
  echo "error: $*" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || die "node not found"
command -v curl >/dev/null 2>&1 || die "curl not found"
[[ -f "$TEMPLATE" ]] || die "missing $TEMPLATE"

WORK="$(mktemp -d)"
MOCK_PID=""
cleanup() {
  [[ -n "$MOCK_PID" ]] && kill "$MOCK_PID" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# --- Extract the script from cloud-init --------------------------------------------
awk '
  /path: \/usr\/local\/sbin\/somanami-idle-check\.sh/ { found = 1; next }
  found && /content: \|/ { inside = 1; next }
  inside {
    if ($0 ~ /^      / || $0 ~ /^[[:space:]]*$/) { sub(/^      /, ""); print; next }
    exit
  }
' "$TEMPLATE" >"$WORK/idle-check.sh"
grep -q 'idle-check:' "$WORK/idle-check.sh" || die "could not find the idle-check script in $TEMPLATE"
chmod +x "$WORK/idle-check.sh"
touch "$WORK/boot-finished"

# --- Fixtures ----------------------------------------------------------------------
# gin SECONDS_AGO METHOD PATH: one Ollama request line as journalctl -o short-unix prints it.
gin() {
  printf '%s.123456 somanami-ollama ollama[812]: [GIN] 2023/11/14 - 22:13:20 | 200 |  2.104s |       127.0.0.1 | %-8s "%s"\n' \
    "$((NOW - $1))" "$2" "$3"
}
log() { cat >"$WORK/$1.log"; }

gin 300 POST /api/chat | log recent-chat
gin 120 POST /api/embed | log recent-embed
{
  gin 2400 POST /api/chat
  gin 1900 POST /api/chat
} | log idle-31min
{
  gin 2400 POST /api/chat
  gin 60 GET /api/tags
  gin 30 GET /api/tags
} | log probes-only
{
  gin 1900 POST /api/chat
  echo "$((NOW - 100)).000001 somanami-ollama ollama[812]: time=... level=INFO msg=\"$MARKER\""
} | log with-marker
: >"$WORK/empty.log"

# --- Mock IMDS and ARM ---------------------------------------------------------------
cat >"$WORK/mock.mjs" <<'EOF'
import { appendFileSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'

const [port, token, vmIdFile, statusFile, seenFile] = process.argv.slice(2)
const vmId = readFileSync(vmIdFile, 'utf8')

createServer((req, res) => {
  const url = new URL(req.url, 'http://mock')
  appendFileSync(
    seenFile,
    JSON.stringify({
      method: req.method,
      path: url.pathname,
      query: url.search,
      metadata: req.headers.metadata ?? null,
      authorization: req.headers.authorization ?? null,
    }) + '\n',
  )
  if (url.pathname === '/metadata/identity/oauth2/token') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ access_token: token, expires_in: '86399' }))
  }
  if (url.pathname === '/metadata/instance/compute/resourceId') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    return res.end(vmId)
  }
  if (url.pathname === `${vmId}/deallocate`) {
    res.writeHead(Number(readFileSync(statusFile, 'utf8').trim()))
    return res.end()
  }
  res.writeHead(404)
  res.end()
}).listen(Number(port), '127.0.0.1')
EOF

echo 202 >"$WORK/arm-status"
: >"$WORK/seen.log"
# Read from a file: Git Bash would rewrite a leading-slash argument into a
# Windows path.
printf '%s' "$VM_ID" >"$WORK/vm-id"
node "$WORK/mock.mjs" "$MOCK_PORT" "$TOKEN" "$WORK/vm-id" "$WORK/arm-status" "$WORK/seen.log" &
MOCK_PID=$!
for _ in $(seq 1 50); do
  curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$MOCK_PORT/" && break
  sleep 0.2
done
: >"$WORK/seen.log"

# --- Assertions --------------------------------------------------------------------
PASSED=0
FAILED=0
OUT=""
CODE=0

pass() {
  PASSED=$((PASSED + 1))
  echo "  ok    $1"
}
fail() {
  FAILED=$((FAILED + 1))
  echo "  FAIL  $1" >&2
}

# run LOG UPTIME_SECONDS [VAR=value...]: runs the script; sets OUT and CODE.
run() {
  local fixture="$1" uptime="$2"
  shift 2
  set +e
  OUT="$(env -i PATH="$PATH" \
    SOMANAMI_TEST_NOW="$NOW" SOMANAMI_TEST_UPTIME="$uptime" \
    SOMANAMI_TEST_LOG_FILE="$WORK/$fixture.log" \
    SOMANAMI_TEST_BOOT_FINISHED="$WORK/boot-finished" \
    SOMANAMI_TEST_IMDS="http://127.0.0.1:$MOCK_PORT" \
    SOMANAMI_TEST_ARM="http://127.0.0.1:$MOCK_PORT" \
    "$@" bash "$WORK/idle-check.sh" 2>&1)"
  CODE=$?
  set -e
}

# expect NAME CODE PATTERN: the last run exited CODE and printed PATTERN.
expect() {
  if [[ "$CODE" == "$2" && "$OUT" == *"$3"* ]]; then
    pass "$1"
  else
    fail "$1: expected exit $2 and \"$3\", got exit $CODE: $OUT"
  fi
}

TWO_HOURS=7200

echo "Dry run decisions:"
run recent-chat "$TWO_HOURS" DRY_RUN=1
expect "a chat 5 min ago keeps the VM" 0 "keep: active"
run recent-embed "$TWO_HOURS" DRY_RUN=1
expect "an embedding 2 min ago keeps the VM" 0 "keep: active"
run idle-31min "$TWO_HOURS" DRY_RUN=1
expect "31 min without a request deallocates" 0 "would deallocate: idle (last activity 31 min ago"
run probes-only "$TWO_HOURS" DRY_RUN=1
expect "health probes alone don't keep the VM up" 0 "would deallocate"
run empty "$((20 * 60))" DRY_RUN=1
expect "a VM booted 20 min ago with no requests yet stays (boot counts as activity)" 0 "keep: active"
run empty "$((10 * 60))" DRY_RUN=1
expect "inside the boot grace period" 0 "keep: inside the 15-min boot grace period"
run empty "$((40 * 60))" DRY_RUN=1
expect "booted 40 min ago and never used deallocates" 0 "would deallocate"
run idle-31min "$TWO_HOURS" DRY_RUN=1 IDLE_MINUTES=45
expect "IDLE_MINUTES overrides the window" 0 "keep: active"
run recent-chat "$TWO_HOURS" DRY_RUN=1 IDLE_MINUTES=4
expect "a short window lets a 5-min-old chat count as idle" 0 "would deallocate"
run empty "$((40 * 60))" DRY_RUN=1 GRACE_MINUTES=60
expect "GRACE_MINUTES overrides the grace period" 0 "keep: inside the 60-min boot grace period"
run idle-31min "$TWO_HOURS" DRY_RUN=1 SOMANAMI_TEST_BOOT_FINISHED="$WORK/missing"
expect "never deallocates while first-boot setup runs" 0 "keep: first-boot setup still running"
run recent-chat "$TWO_HOURS" DRY_RUN=1 IDLE_MINUTES=0
expect "rejects a zero IDLE_MINUTES" 2 "IDLE_MINUTES must be a positive integer"
run recent-chat "$TWO_HOURS" DRY_RUN=1 IDLE_MINUTES=soon
expect "rejects a non-numeric IDLE_MINUTES" 2 "IDLE_MINUTES must be a positive integer"
if [[ ! -s "$WORK/seen.log" ]]; then
  pass "a dry run never calls IMDS or ARM"
else
  fail "a dry run made requests: $(cat "$WORK/seen.log")"
fi

echo "Log content never reaches the output:"
run with-marker "$TWO_HOURS" DRY_RUN=1
if [[ "$OUT" != *"$MARKER"* && "$OUT" != *"[GIN]"* ]]; then
  pass "only times and counts are printed"
else
  fail "the script echoed log content: $OUT"
fi

echo "Deallocating through the managed identity:"
: >"$WORK/seen.log"
run idle-31min "$TWO_HOURS"
expect "an idle VM asks ARM to deallocate" 0 "deallocate accepted (202)"
calls="$(node -e '
  const lines = require("fs").readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean)
  for (const s of lines.map((l) => JSON.parse(l))) console.log([s.method, s.path, s.query, s.metadata, s.authorization].join(" "))
' "$WORK/seen.log")"
if [[ "$calls" == *"GET /metadata/identity/oauth2/token ?api-version=2018-02-01&resource=https%3A%2F%2Fmanagement.azure.com%2F true "* ]]; then
  pass "token requested from IMDS for ARM, with Metadata: true"
else
  fail "IMDS token call missing or wrong: $calls"
fi
if [[ "$calls" == *"POST $VM_ID/deallocate ?api-version=2024-07-01  Bearer $TOKEN"* ]]; then
  pass "deallocate posted to this VM's own resource id with the bearer token"
else
  fail "ARM deallocate call missing or wrong: $calls"
fi
if [[ "$OUT" != *"$TOKEN"* ]]; then
  pass "the token is never printed"
else
  fail "the token appears in the output"
fi

echo 403 >"$WORK/arm-status"
run idle-31min "$TWO_HOURS"
expect "a refused deallocate fails the unit, without the token" 1 "deallocate refused (403)"
[[ "$OUT" != *"$TOKEN"* ]] || fail "the token appears in the refusal output"

: >"$WORK/seen.log"
run recent-chat "$TWO_HOURS"
expect "an active VM makes no calls at all" 0 "keep: active"
if [[ ! -s "$WORK/seen.log" ]]; then
  pass "no IMDS or ARM calls while active"
else
  fail "calls made while active: $(cat "$WORK/seen.log")"
fi

echo
echo "$PASSED passed, $FAILED failed"
((FAILED == 0))
