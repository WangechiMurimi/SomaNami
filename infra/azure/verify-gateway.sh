#!/usr/bin/env bash
# Checks a live Ollama gateway against #151's acceptance criteria.
#
# Usage: OLLAMA_BASE_URL=https://<label>.<region>.cloudapp.azure.com \
#        OLLAMA_API_KEY=<token> ./infra/azure/verify-gateway.sh
#
# The token goes to curl on stdin, never in argv, so it doesn't show up in the
# process list. Exits non-zero if any check fails.
set -euo pipefail

BASE="${OLLAMA_BASE_URL:-}"
TOKEN="${OLLAMA_API_KEY:-}"
MODELS="${MODELS:-qwen2.5:3b nomic-embed-text}"

die() {
  echo "error: $*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || die "curl not found"
[[ "$BASE" == https://* ]] || die "OLLAMA_BASE_URL must be set to the https:// gateway URL"
[[ -n "$TOKEN" ]] || die "OLLAMA_API_KEY must be set"
BASE="${BASE%/}"
HOST="${BASE#https://}"
HOST="${HOST%%/*}"

PASSED=0
FAILED=0
pass() {
  PASSED=$((PASSED + 1))
  echo "  ok    $1"
}
fail() {
  FAILED=$((FAILED + 1))
  echo "  FAIL  $1" >&2
}

# Prints the HTTP status; the body goes to $BODY_FILE.
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT
status_authed() {
  printf 'header = "Authorization: Bearer %s"\n' "$TOKEN" |
    curl --config - -s --max-time 15 -o "$BODY_FILE" -w '%{http_code}' "$@" || true
}
status_plain() { curl -s --max-time 15 -o /dev/null -w '%{http_code}' "$@" || true; }

echo "Gateway $BASE"

code="$(status_authed "$BASE/api/tags")"
if [[ "$code" == 200 ]]; then
  pass "GET /api/tags with the token -> 200"
  for model in $MODELS; do
    if grep -q "\"$model" "$BODY_FILE"; then
      pass "model $model is pulled"
    else
      fail "model $model is missing from /api/tags"
    fi
  done
else
  fail "GET /api/tags with the token: expected 200, got $code"
fi

code="$(status_plain "$BASE/api/tags")"
[[ "$code" == 401 ]] && pass "no token -> 401" || fail "no token: expected 401, got $code"

code="$(status_plain -H "Authorization: Bearer wrong" "$BASE/api/tags")"
[[ "$code" == 401 ]] && pass "wrong token -> 401" || fail "wrong token: expected 401, got $code"

code="$(status_authed -X POST -d '{"model":"llama3"}' "$BASE/api/pull")"
[[ "$code" == 404 ]] && pass "POST /api/pull with the token -> 404" || fail "POST /api/pull: expected 404, got $code"

code="$(status_authed -X DELETE -d '{"model":"qwen2.5:3b"}' "$BASE/api/delete")"
[[ "$code" == 404 ]] && pass "DELETE /api/delete with the token -> 404" || fail "DELETE /api/delete: expected 404, got $code"

code="$(status_authed -X POST -d '{}' "$BASE/v1/chat/completions")"
[[ "$code" == 404 ]] && pass "POST /v1/chat/completions with the token -> 404" || fail "OpenAI-compatible route: expected 404, got $code"

# 000 means curl could not connect at all, which is what we want.
code="$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' "http://$HOST:11434/api/tags" || true)"
[[ "$code" == 000 ]] && pass "port 11434 unreachable from here" || fail "port 11434 answered with $code; Ollama is exposed"

code="$(status_plain "http://$HOST/api/tags")"
[[ "$code" == 308 ]] && pass "plain HTTP -> 308 redirect to HTTPS" || fail "plain HTTP: expected 308, got $code"

echo
echo "$PASSED passed, $FAILED failed"
((FAILED == 0))
