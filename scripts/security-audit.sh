#!/usr/bin/env bash
set -euo pipefail

npm audit --audit-level=high
npm audit --prefix web --audit-level=high

if command -v cargo-audit >/dev/null 2>&1; then
  cargo audit --file bridge/Cargo.lock
  cargo audit --file vendor/herdr-compat/Cargo.lock
else
  echo "cargo-audit is required for the complete security gate" >&2
  exit 1
fi

if git grep -nEI \
  '(BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY|AKIA[0-9A-Z]{16}|https?://[^/@[:space:]]+:[^/@[:space:]]+@)' \
  -- . ':!docs/evidence/**'; then
  echo "Potential committed credential material found" >&2
  exit 1
fi

if rg -n --glob '*.{ts,tsx,js,mjs,rs}' \
  '(sudo([[:space:]]|$)|id_rsa|\.ssh/|private[_-]?key|bearer[_-]?token)' \
  web/src bridge/src vendor/herdr-compat/src; then
  echo "Core source contains prohibited privilege, SSH-key, or credential handling" >&2
  exit 1
fi

echo "Herdr Web security audit passed"
