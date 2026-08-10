#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRIDGE_HOST="${HERDR_WEB_BRIDGE_HOST:-127.0.0.1}"
BRIDGE_PORT="${HERDR_WEB_BRIDGE_PORT:-8787}"
FRONTEND_HOST="${HERDR_WEB_FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${HERDR_WEB_FRONTEND_PORT:-5173}"
BRIDGE_ORIGIN="http://${BRIDGE_HOST}:${BRIDGE_PORT}"
BRIDGE_LOG="${HERDR_WEB_BRIDGE_LOG:-${TMPDIR:-/tmp}/herdr-web-bridge.log}"
BRIDGE_PID=""
STARTED_BRIDGE=0

cleanup() {
  if [[ "$STARTED_BRIDGE" == "1" && -n "$BRIDGE_PID" ]] && kill -0 "$BRIDGE_PID" 2>/dev/null; then
    kill "$BRIDGE_PID" 2>/dev/null || true
    wait "$BRIDGE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

die() {
  echo "dev:local: $*" >&2
  exit 1
}

bridge_ready() {
  curl --fail --silent --show-error --max-time 2 \
    "$BRIDGE_ORIGIN/api/capabilities" >/dev/null 2>&1
}

if ! bridge_ready; then
  if [[ -z "${HERDR_SESSION:-}" ]]; then
    SOCKET_PATH="${HERDR_SOCKET_PATH:-${XDG_CONFIG_HOME:-$HOME/.config}/herdr/herdr.sock}"
    [[ -S "$SOCKET_PATH" ]] || die "Herdr socket not found at $SOCKET_PATH; start Herdr first with: herdr"
  fi

  if [[ ! -x "$ROOT/bridge/target/debug/herdr-web-bridge" ]]; then
    echo "dev:local: bridge binary missing; building it"
    npm run bridge:build
  fi
  if [[ ! -d "$ROOT/web/dist" ]]; then
    echo "dev:local: web/dist missing; building web assets"
    npm run build:web
  fi

  bridge_args=()
  if [[ -n "${HERDR_SESSION:-}" ]]; then
    bridge_args+=(--session "$HERDR_SESSION")
  fi

  echo "dev:local: starting bridge at $BRIDGE_ORIGIN"
  HOST="$BRIDGE_HOST" PORT="$BRIDGE_PORT" \
    "$ROOT/scripts/run-bridge.sh" "${bridge_args[@]}" >"$BRIDGE_LOG" 2>&1 &
  BRIDGE_PID=$!
  STARTED_BRIDGE=1

  bridge_started=0
  for _ in $(seq 1 50); do
    if bridge_ready; then
      bridge_started=1
      break
    fi
    if ! kill -0 "$BRIDGE_PID" 2>/dev/null; then
      echo "dev:local: bridge exited during startup; log follows:" >&2
      sed -n '1,160p' "$BRIDGE_LOG" >&2 || true
      exit 1
    fi
    sleep 0.1
  done
  [[ "$bridge_started" == "1" ]] || die "bridge did not become ready; see $BRIDGE_LOG"
else
  echo "dev:local: reusing healthy bridge at $BRIDGE_ORIGIN"
fi

echo "dev:local: full app: $BRIDGE_ORIGIN"
echo "dev:local: starting Vite; use its printed URL for frontend HMR"

HERDR_WEB_BRIDGE="$BRIDGE_ORIGIN" \
  npm run dev --prefix "$ROOT/web" -- \
    --host "$FRONTEND_HOST" --port "$FRONTEND_PORT"
