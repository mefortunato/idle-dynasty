#!/usr/bin/env bash
# Start both development servers from any working directory.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

for tool in uv npm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Missing required command: %s. Install uv and Node.js 22+ (with npm), then retry.\n' "$tool" >&2
    exit 1
  fi
done

for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if [[ ! "$port" =~ ^[0-9]{1,5}$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); then
    printf 'Invalid port: %s. Choose a number from 1 to 65535.\n' "$port" >&2
    exit 1
  fi
done
if (( 10#$BACKEND_PORT == 10#$FRONTEND_PORT )); then
  printf 'BACKEND_PORT and FRONTEND_PORT must be different.\n' >&2
  exit 1
fi

# Keep dependency caches writable in managed development environments too.
export UV_CACHE_DIR="${UV_CACHE_DIR:-$ROOT_DIR/.cache/uv}"
export npm_config_cache="${npm_config_cache:-${NPM_CONFIG_CACHE:-$ROOT_DIR/.cache/npm}}"

printf 'Checking backend dependencies...\n'
(cd "$ROOT_DIR/backend" && uv sync --locked)
if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
  printf 'Installing frontend dependencies...\n'
  (cd "$ROOT_DIR/frontend" && npm ci)
fi

backend_pid=''
frontend_pid=''
cleanup() {
  trap '' INT TERM HUP
  # Each job has its own process group, including reloaders and npm children.
  for pid in "$backend_pid" "$frontend_pid"; do
    if [[ -n "$pid" ]]; then
      kill -TERM -- "-$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
set -m

printf '\nStarting Idle Dynasty development servers:\n'
printf '  Frontend: http://localhost:%s\n' "$FRONTEND_PORT"
printf '  Backend:  http://localhost:%s/docs\n' "$BACKEND_PORT"
printf '  Press Ctrl+C to stop both servers.\n\n'

(
  cd "$ROOT_DIR/backend"
  exec uv run --no-sync uvicorn app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT"
) &
backend_pid=$!

(
  cd "$ROOT_DIR/frontend"
  export API_PROXY_TARGET="http://127.0.0.1:$BACKEND_PORT"
  exec npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" --strictPort
) &
frontend_pid=$!

# Portable to macOS's Bash as well as Linux; stop the sibling if either exits.
while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null; do
  sleep 1
done
if ! kill -0 "$backend_pid" 2>/dev/null; then
  stopped_pid=$backend_pid
  stopped_name=Backend
else
  stopped_pid=$frontend_pid
  stopped_name=Frontend
fi
status=0
wait "$stopped_pid" || status=$?
printf '\n%s server stopped (exit %s); stopping both servers.\n' "$stopped_name" "$status"
exit "$status"
