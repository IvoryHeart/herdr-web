#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HERDR_SOURCE="${HERDR_SRC:-}"

if [[ -z "$HERDR_SOURCE" ]]; then
  echo "HERDR_SRC must point at a clean Herdr v0.8.2 checkout" >&2
  exit 1
fi

TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/herdr-vendor-regression.XXXXXX")"
mkdir -p "$TEST_ROOT/scripts" "$TEST_ROOT/bridge" "$TEST_ROOT/vendor"
cp "$ROOT/scripts/check-vendor.sh" "$TEST_ROOT/scripts/check-vendor.sh"
cp "$ROOT/bridge/Cargo.toml" "$TEST_ROOT/bridge/Cargo.toml"
rsync -a --exclude target "$ROOT/vendor/herdr-compat/" "$TEST_ROOT/vendor/herdr-compat/"

manifest="$TEST_ROOT/vendor/herdr-compat/VENDOR-MANIFEST.toml"
sed -i \
  '/source = "src\/api\/client.rs"/,/destination_sha256 =/ {
    s/source_sha256 = "[0-9a-f]\{64\}"/source_sha256 = "0000000000000000000000000000000000000000000000000000000000000000"/
  }' \
  "$manifest"

evidence="$TEST_ROOT/check.log"
if HERDR_SRC="$HERDR_SOURCE" "$TEST_ROOT/scripts/check-vendor.sh" >"$evidence" 2>&1; then
  echo "vendor provenance regression failed: bad adapted source hash was accepted" >&2
  cat "$evidence" >&2
  exit 1
fi
if ! rg -q 'manifest source hash mismatch for src/api/client.rs' "$evidence"; then
  echo "vendor provenance regression failed: checker rejected for an unexpected reason" >&2
  cat "$evidence" >&2
  exit 1
fi

echo "vendor provenance regression passed: incorrect adapted source hash was rejected"
echo "evidence: $evidence"
