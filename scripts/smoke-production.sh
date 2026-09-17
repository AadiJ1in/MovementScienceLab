#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
BASE_URL="http://127.0.0.1:${PORT}"
LOG_FILE="${TMPDIR:-/tmp}/movement-science-lab-next.log"
HEALTH_FILE="${TMPDIR:-/tmp}/movement-science-lab-health.json"

pnpm exec next start -p "$PORT" >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

ready=0
for _ in {1..30}; do
  if curl --fail --silent --show-error "$BASE_URL/api/health" >"$HEALTH_FILE"; then
    ready=1
    break
  fi

  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Production server exited before becoming healthy."
    cat "$LOG_FILE"
    exit 1
  fi

  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  echo "Production server did not become healthy."
  cat "$LOG_FILE"
  exit 1
fi

if ! grep -q '"ok":true' "$HEALTH_FILE"; then
  echo "Health endpoint returned an unexpected payload."
  cat "$HEALTH_FILE"
  exit 1
fi

routes=(
  "/"
  "/assessment"
  "/camera-lab"
  "/research"
  "/validation"
  "/diagnostics"
)

for route in "${routes[@]}"; do
  if ! curl --fail --silent --show-error "$BASE_URL$route" >/dev/null; then
    echo "Smoke test failed for route: $route"
    cat "$LOG_FILE"
    exit 1
  fi
  echo "ok $route"
done

echo "Production smoke test passed."
