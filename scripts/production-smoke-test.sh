#!/bin/bash
set -u

# Usage: ./scripts/production-smoke-test.sh <frontend-url> <backend-url>
FRONTEND_URL="${1:?Usage: $0 <frontend-url> <backend-url>}"
BACKEND_URL="${2:?Usage: $0 <frontend-url> <backend-url>}"

PASS=0
FAIL=0
TOTAL=12

check() {
  local name="$1"
  local result="$2"
  if [ "$result" = "true" ]; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name"
    FAIL=$((FAIL + 1))
  fi
}

echo "═══════════════════════════════════════"
echo "  DocMind Production Smoke Test"
echo "  Frontend: $FRONTEND_URL"
echo "  Backend:  $BACKEND_URL"
echo "═══════════════════════════════════════"
echo ""

# 1. Backend health
echo "1. Backend health..."
HEALTH=$(curl -sf "$BACKEND_URL/health" | jq -r '.status' 2>/dev/null)
check "Backend returns status=ok" "$([ "$HEALTH" = "ok" ] && echo true || echo false)"

# 2. Frontend loads
echo "2. Frontend loads..."
FE_CODE=$(curl -so /dev/null -w "%{http_code}" "$FRONTEND_URL" 2>/dev/null)
check "Frontend returns HTTP 200" "$([ "$FE_CODE" = "200" ] && echo true || echo false)"

# 3. HTTPS enforced
echo "3. HTTPS..."
HSTS=$(curl -sI "$FRONTEND_URL" 2>/dev/null | grep -ci "strict-transport-security")
check "HSTS header present" "$([ "$HSTS" -ge 1 ] && echo true || echo false)"

# 4. Security headers
echo "4. Security headers..."
XFRAME=$(curl -sI "$FRONTEND_URL" 2>/dev/null | grep -ci "x-frame-options")
check "X-Frame-Options present" "$([ "$XFRAME" -ge 1 ] && echo true || echo false)"

# 5. CORS rejects bad origin
echo "5. CORS..."
CORS_RESP=$(curl -sI -H "Origin: https://evil.com" "$BACKEND_URL/health" 2>/dev/null)
CORS_ALLOW=$(echo "$CORS_RESP" | grep -i "access-control-allow-origin" | grep -c "evil.com")
check "CORS rejects evil.com origin" "$([ "$CORS_ALLOW" = "0" ] && echo true || echo false)"

# 6. Register test user
echo "6. Register free-tier user..."
REG_EMAIL="smoketest-$(date +%s)@example.com"
REG=$(curl -sf -X POST "$FRONTEND_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$REG_EMAIL\",\"password\":\"SmokeTest123!\"}" 2>/dev/null)
TOKEN=$(echo "$REG" | jq -r '.accessToken' 2>/dev/null)
check "Registration returns access token" "$([ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] && echo true || echo false)"

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "  FATAL: Cannot continue without auth token"
  echo ""
  echo "Result: $PASS/$TOTAL passed, $((TOTAL - PASS)) skipped"
  exit 1
fi

# 7. Protected route works with token
echo "7. Auth protects routes..."
DOCS_CODE=$(curl -so /dev/null -w "%{http_code}" "$FRONTEND_URL/api/documents" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null)
NOAUTH_CODE=$(curl -so /dev/null -w "%{http_code}" "$FRONTEND_URL/api/documents" 2>/dev/null)
check "Authenticated request succeeds" "$([ "$DOCS_CODE" = "200" ] && echo true || echo false)"
check "Unauthenticated request returns 401" "$([ "$NOAUTH_CODE" = "401" ] && echo true || echo false)"

# 8. Dashboard returns stats
echo "8. Dashboard..."
STATS=$(curl -sf "$FRONTEND_URL/api/dashboard/stats" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null)
HAS_DOCS=$(echo "$STATS" | jq 'has("documents")' 2>/dev/null)
check "Dashboard stats returns documents field" "$([ "$HAS_DOCS" = "true" ] && echo true || echo false)"

# 9. Ask endpoint responds (free tier = Groq)
echo "9. Ask endpoint (free tier → Groq)..."
ASK=$(curl -sf -X POST "$FRONTEND_URL/api/ask" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "Hello, are you working?"}' 2>/dev/null)
HAS_ANSWER=$(echo "$ASK" | jq 'has("answer")' 2>/dev/null)
check "Ask returns an answer" "$([ "$HAS_ANSWER" = "true" ] && echo true || echo false)"

# 10. Agent endpoint responds
echo "10. Agent endpoint..."
AGENT=$(curl -sf -X POST "$FRONTEND_URL/api/agent/run" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is 25 * 4?"}' 2>/dev/null)
HAS_STEPS=$(echo "$AGENT" | jq 'has("steps")' 2>/dev/null)
check "Agent returns steps" "$([ "$HAS_STEPS" = "true" ] && echo true || echo false)"

# 11. SSE streaming works
echo "11. SSE streaming..."
SSE_DATA=$(curl -sN -X POST "$FRONTEND_URL/api/ask/stream" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "Say hello"}' \
  --max-time 15 2>/dev/null | head -5)
HAS_DATA=$(echo "$SSE_DATA" | grep -c "data:" 2>/dev/null || echo 0)
check "SSE stream returns data: events" "$([ "$HAS_DATA" -ge 1 ] && echo true || echo false)"

# Cleanup test user (optional — comment out if you want to keep for browser testing)
# curl -sf -X POST "$FRONTEND_URL/api/auth/logout" -H "Authorization: Bearer $TOKEN" >/dev/null 2>&1

echo ""
echo "═══════════════════════════════════════"
echo "  Result: $PASS/$TOTAL passed, $FAIL failed"
echo "═══════════════════════════════════════"

[ "$FAIL" -eq 0 ] && echo "  ✓ ALL CHECKS PASSED — system is live" || echo "  ✗ FAILURES DETECTED — investigate before announcing"
exit $FAIL
