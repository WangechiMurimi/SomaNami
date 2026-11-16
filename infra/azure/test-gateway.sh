#!/usr/bin/env bash
# Exercises the Ollama gateway's Caddyfile offline (#151), with no Azure needed.
#
# The Caddyfile is extracted from cloud-init.yaml, so this tests exactly what
# the VM runs. Only the site address (plain HTTP on loopback instead of the
# Azure DNS name with TLS) and the upstream port change. A Node mock stands in
# for Ollama: it reads every body in full, as Ollama does, and records every
# request that reaches it.
#
# Usage: npm run test:gateway
#        CADDY=/path/to/caddy ./infra/azure/test-gateway.sh
# Needs: caddy 2.x and node on PATH (or CADDY=...), plus curl.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/cloud-init.yaml"
CADDY="${CADDY:-caddy}"
GATEWAY_PORT="${GATEWAY_PORT:-18080}"
MOCK_PORT="${MOCK_PORT:-18434}"
GATEWAY="http://127.0.0.1:$GATEWAY_PORT"

# Test-only values. The marker stands in for a learner's passage: it must reach
# the model, but never appear in any log.
TOKEN="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
MARKER="LEARNER-PASSAGE-$RANDOM$RANDOM"

die() {
  echo "error: $*" >&2
  exit 1
}

command -v "$CADDY" >/dev/null 2>&1 || die "caddy not found. Install it (https://caddyserver.com/docs/install) or set CADDY=/path/to/caddy"
command -v node >/dev/null 2>&1 || die "node not found"
command -v curl >/dev/null 2>&1 || die "curl not found"
[[ -f "$TEMPLATE" ]] || die "missing $TEMPLATE"

WORK="$(mktemp -d)"
CADDY_PID=""
MOCK_PID=""
cleanup() {
  [[ -n "$CADDY_PID" ]] && kill "$CADDY_PID" 2>/dev/null || true
  [[ -n "$MOCK_PID" ]] && kill "$MOCK_PID" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# --- Extract the Caddyfile from cloud-init ---------------------------------------
# It is the block scalar under `path: /etc/somanami/Caddyfile`, indented 6 spaces.
awk '
  /path: \/etc\/somanami\/Caddyfile/ { found = 1; next }
  found && /content: \|/ { inside = 1; next }
  inside {
    if ($0 ~ /^      / || $0 ~ /^[[:space:]]*$/) { sub(/^      /, ""); print; next }
    exit
  }
' "$TEMPLATE" >"$WORK/Caddyfile.extracted"
grep -q '__DOMAIN__ {' "$WORK/Caddyfile.extracted" || die "could not find the Caddyfile in $TEMPLATE"
grep -q '127.0.0.1:11434' "$WORK/Caddyfile.extracted" || die "the Caddyfile no longer proxies to 127.0.0.1:11434; update this test"

{
  printf '{\n\tadmin off\n\tauto_https off\n}\n\n'
  sed -e "s|__DOMAIN__|http://127.0.0.1:$GATEWAY_PORT|" \
    -e "s|127\.0\.0\.1:11434|127.0.0.1:$MOCK_PORT|" \
    "$WORK/Caddyfile.extracted"
} >"$WORK/Caddyfile"

# --- Mock Ollama ----------------------------------------------------------------------
cat >"$WORK/mock.mjs" <<'EOF'
import { appendFileSync } from 'node:fs'
import { createServer } from 'node:http'

const [port, logFile] = process.argv.slice(2)

createServer((req, res) => {
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString()
    const seen = {
      method: req.method,
      url: req.url,
      host: req.headers.host,
      authorization: req.headers.authorization ?? null,
      bodyBytes: Buffer.byteLength(body),
    }
    appendFileSync(logFile, JSON.stringify(seen) + '\n')
    // Simulates Ollama dying mid-request, so the gateway's error path runs.
    if (body.includes('BREAK-CONNECTION')) return req.socket.destroy()
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ mock: 'ollama', ...seen }))
  })
}).listen(Number(port), '127.0.0.1')
EOF

: >"$WORK/upstream.log"
node "$WORK/mock.mjs" "$MOCK_PORT" "$WORK/upstream.log" &
MOCK_PID=$!

SOMANAMI_API_KEY="$TOKEN" "$CADDY" run --config "$WORK/Caddyfile" --adapter caddyfile \
  >"$WORK/caddy.log" 2>&1 &
CADDY_PID=$!

ready=0
for _ in $(seq 1 50); do
  if curl -s -o /dev/null --max-time 1 "$GATEWAY/" &&
    curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$MOCK_PORT/"; then
    ready=1
    break
  fi
  sleep 0.2
done
if [[ "$ready" != 1 ]]; then
  cat "$WORK/caddy.log" >&2
  die "caddy or the mock did not start (ports $GATEWAY_PORT, $MOCK_PORT)"
fi
# The readiness probe above reached the mock directly; start its record clean.
: >"$WORK/upstream.log"

# --- Assertions --------------------------------------------------------------------
PASSED=0
FAILED=0
STATUS=""
BODY=""

pass() {
  PASSED=$((PASSED + 1))
  echo "  ok    $1"
}
fail() {
  FAILED=$((FAILED + 1))
  echo "  FAIL  $1" >&2
}

# request METHOD PATH AUTH_HEADER [curl args...]; AUTH_HEADER may be empty.
request() {
  local method="$1" path="$2" auth="$3"
  shift 3
  local args=(-s --path-as-is --max-time 10 -o "$WORK/body" -w '%{http_code}' -X "$method")
  [[ -n "$auth" ]] && args+=(-H "Authorization: $auth")
  STATUS="$(curl "${args[@]}" "$@" "$GATEWAY$path" || true)"
  BODY="$(cat "$WORK/body" 2>/dev/null || true)"
}

reached_upstream() { [[ "$BODY" == *'"mock":"ollama"'* ]]; }

# expect_blocked NAME STATUS METHOD PATH AUTH: the gateway answers itself.
expect_blocked() {
  local name="$1" want="$2"
  request "$3" "$4" "$5"
  if [[ "$STATUS" == "$want" ]] && ! reached_upstream; then
    pass "$name -> $want"
  else
    fail "$name: expected $want from the gateway, got $STATUS ${BODY:0:120}"
  fi
}

GOOD="Bearer $TOKEN"
CHAT_BODY="{\"model\":\"qwen2.5:3b\",\"messages\":[{\"role\":\"user\",\"content\":\"$MARKER\"}]}"

echo "Authentication (every route, before routing, so nothing is revealed):"
expect_blocked "no token, GET /api/tags" 401 GET /api/tags ""
expect_blocked "no token, POST /api/chat" 401 POST /api/chat ""
expect_blocked "no token, POST /api/pull" 401 POST /api/pull ""
expect_blocked "no token, GET /" 401 GET / ""
expect_blocked "wrong token" 401 GET /api/tags "Bearer wrong"
expect_blocked "empty bearer" 401 GET /api/tags "Bearer "
expect_blocked "token without scheme" 401 GET /api/tags "$TOKEN"
expect_blocked "token with a suffix" 401 GET /api/tags "Bearer ${TOKEN}0"
expect_blocked "token prefix only" 401 GET /api/tags "Bearer ${TOKEN:0:32}"
expect_blocked "basic scheme" 401 GET /api/tags "Basic $TOKEN"

echo "Allowed calls reach Ollama:"
request GET /api/tags "$GOOD"
if [[ "$STATUS" == 200 ]] && reached_upstream && [[ "$BODY" == *'"url":"/api/tags"'* ]]; then
  pass "GET /api/tags -> 200"
else
  fail "GET /api/tags: got $STATUS ${BODY:0:160}"
fi
if [[ "$BODY" == *'"host":"localhost:11434"'* ]]; then
  pass "Host header rewritten to localhost:11434"
else
  fail "Host header not rewritten: ${BODY:0:160}"
fi
if [[ "$BODY" == *'"authorization":null'* ]]; then
  pass "bearer token stripped before Ollama"
else
  fail "Ollama received the Authorization header: ${BODY:0:160}"
fi

request POST /api/chat "$GOOD" -H 'Content-Type: application/json' --data "$CHAT_BODY"
expected_bytes="$(printf '%s' "$CHAT_BODY" | wc -c | tr -d ' ')"
if [[ "$STATUS" == 200 ]] && [[ "$BODY" == *"\"bodyBytes\":$expected_bytes"* ]]; then
  pass "POST /api/chat -> 200, body forwarded intact"
else
  fail "POST /api/chat: got $STATUS ${BODY:0:160}"
fi

request POST /api/embed "$GOOD" -H 'Content-Type: application/json' \
  --data '{"model":"nomic-embed-text","input":["a"]}'
if [[ "$STATUS" == 200 ]] && reached_upstream; then
  pass "POST /api/embed -> 200"
else
  fail "POST /api/embed: got $STATUS ${BODY:0:160}"
fi

echo "Everything else is refused, even with the token:"
expect_blocked "POST /api/pull" 404 POST /api/pull "$GOOD"
expect_blocked "POST /api/push" 404 POST /api/push "$GOOD"
expect_blocked "POST /api/create" 404 POST /api/create "$GOOD"
expect_blocked "POST /api/copy" 404 POST /api/copy "$GOOD"
expect_blocked "DELETE /api/delete" 404 DELETE /api/delete "$GOOD"
expect_blocked "POST /api/generate" 404 POST /api/generate "$GOOD"
expect_blocked "POST /api/show" 404 POST /api/show "$GOOD"
expect_blocked "GET /api/ps" 404 GET /api/ps "$GOOD"
expect_blocked "GET /api/version" 404 GET /api/version "$GOOD"
expect_blocked "POST /api/blobs/<digest>" 404 POST /api/blobs/sha256:00 "$GOOD"
expect_blocked "POST /v1/chat/completions" 404 POST /v1/chat/completions "$GOOD"
expect_blocked "GET /" 404 GET / "$GOOD"
expect_blocked "GET /api/chat (wrong method)" 404 GET /api/chat "$GOOD"
expect_blocked "POST /api/tags (wrong method)" 404 POST /api/tags "$GOOD"
expect_blocked "PUT /api/embed (wrong method)" 404 PUT /api/embed "$GOOD"
expect_blocked "POST /api/chat/../pull" 404 POST /api/chat/../pull "$GOOD"
expect_blocked "POST /api/chat/%2e%2e/pull" 404 POST /api/chat/%2e%2e/pull "$GOOD"
expect_blocked "POST /api/chat%2F..%2Fpull" 404 POST '/api/chat%2F..%2Fpull' "$GOOD"
expect_blocked "POST /api/chatx" 404 POST /api/chatx "$GOOD"
expect_blocked "POST /api/chat/sub" 404 POST /api/chat/sub "$GOOD"

echo "Request size limit:"
head -c $((5 * 1024 * 1024)) /dev/zero | tr '\0' 'a' >"$WORK/big.txt"
request POST /api/chat "$GOOD" --data-binary "@$WORK/big.txt"
if [[ "$STATUS" == 413 ]]; then
  pass "5 MB body -> 413"
else
  fail "5 MB body: expected 413, got $STATUS ${BODY:0:120}"
fi

echo "Upstream failure:"
request POST /api/chat "$GOOD" --data "{\"content\":\"$MARKER BREAK-CONNECTION\"}"
if [[ "$STATUS" == 502 ]]; then
  pass "Ollama drops the connection -> 502"
else
  fail "dropped connection: expected 502, got $STATUS"
fi

echo "Nothing sensitive reaches a log, and nothing unexpected reaches Ollama:"
# Stop Caddy first so every buffered log line is flushed.
kill "$CADDY_PID" 2>/dev/null || true
wait "$CADDY_PID" 2>/dev/null || true
CADDY_PID=""
if grep -q "$TOKEN" "$WORK/caddy.log"; then
  fail "the bearer token appears in Caddy's output"
else
  pass "token absent from Caddy's output"
fi
if grep -q "$MARKER" "$WORK/caddy.log"; then
  fail "a request body appears in Caddy's output"
else
  pass "request bodies absent from Caddy's output"
fi
unexpected="$(node -e '
  const lines = require("fs").readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean)
  const allowed = new Set(["GET /api/tags", "POST /api/chat", "POST /api/embed"])
  for (const seen of lines.map((line) => JSON.parse(line))) {
    const key = `${seen.method} ${seen.url.split("?")[0]}`
    if (!allowed.has(key)) console.log(key)
  }
' "$WORK/upstream.log")"
if [[ -z "$unexpected" ]]; then
  pass "Ollama only ever saw GET /api/tags, POST /api/chat and POST /api/embed"
else
  fail "Ollama received: $(echo "$unexpected" | tr '\n' ' ')"
fi

echo
echo "$PASSED passed, $FAILED failed"
if ((FAILED > 0)); then
  echo "--- caddy output ---" >&2
  cat "$WORK/caddy.log" >&2
  exit 1
fi
