#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPAT="$ROOT/vendor/herdr-compat"
EXPECTED_HERDR_COMMIT="9eb521456ac0d19d3ab3d9d7cea3cca10baa8a4c"
EXPECTED_HERDR_RELEASE="v0.8.2"

if ! command -v rg >/dev/null; then
  echo "ripgrep (rg) is required for vendor checks" >&2
  exit 1
fi

required=(
  "$COMPAT/Cargo.toml"
  "$COMPAT/VENDOR-MANIFEST.toml"
  "$COMPAT/src/lib.rs"
  "$COMPAT/src/api/client.rs"
  "$COMPAT/src/api/status.rs"
  "$COMPAT/src/api/schema.rs"
  "$COMPAT/src/api/schema"
  "$COMPAT/src/api/schema/agents.rs"
  "$COMPAT/src/api/schema/common.rs"
  "$COMPAT/src/api/schema/events.rs"
  "$COMPAT/src/api/schema/integrations.rs"
  "$COMPAT/src/api/schema/panes.rs"
  "$COMPAT/src/api/schema/plugins.rs"
  "$COMPAT/src/api/schema/response.rs"
  "$COMPAT/src/api/schema/server.rs"
  "$COMPAT/src/api/schema/session.rs"
  "$COMPAT/src/api/schema/tabs.rs"
  "$COMPAT/src/api/schema/tests.rs"
  "$COMPAT/src/api/schema/workspaces.rs"
  "$COMPAT/src/api/schema/worktrees.rs"
  "$COMPAT/src/ipc.rs"
  "$COMPAT/src/input.rs"
  "$COMPAT/src/logging.rs"
  "$COMPAT/src/popup_size.rs"
  "$COMPAT/src/protocol.rs"
  "$COMPAT/src/protocol/wire.rs"
  "$COMPAT/src/raw_input.rs"
  "$COMPAT/src/server/socket_paths.rs"
)

for path in "${required[@]}"; do
  if [[ ! -e "$path" ]]; then
    echo "missing Herdr compatibility vendor file: $path" >&2
    exit 1
  fi
done

if [[ -d "$ROOT/vendor/herdr" ]]; then
  echo "full vendor/herdr snapshot is not allowed; keep only vendor/herdr-compat" >&2
  exit 1
fi

if rg -n '#\[path[[:space:]]*=' "$ROOT/bridge" "$COMPAT" >/dev/null; then
  echo "build-time Rust #[path] imports are not allowed in bridge or vendor/herdr-compat" >&2
  rg -n '#\[path[[:space:]]*=' "$ROOT/bridge" "$COMPAT" >&2
  exit 1
fi

if rg -n '\bcustom_status\b' "$COMPAT" >/dev/null; then
  echo "obsolete custom_status fields are not allowed in the Herdr 0.8.2 compatibility copy" >&2
  rg -n '\bcustom_status\b' "$COMPAT" >&2
  exit 1
fi

verify_manifest_hashes() {
  while IFS='|' read -r destination expected_hash; do
    [[ -n "$destination" ]] || continue
    if [[ ! -f "$COMPAT/$destination" ]]; then
      echo "manifest destination is missing: $destination" >&2
      exit 1
    fi
    actual_hash="$(sha256sum "$COMPAT/$destination" | awk '{print $1}')"
    if [[ "$actual_hash" != "$expected_hash" ]]; then
      echo "manifest hash mismatch for $destination" >&2
      echo "expected: $expected_hash" >&2
      echo "found:    $actual_hash" >&2
      exit 1
    fi
  done < <(awk -F'"' '/^destination = / { destination = $2 } /^destination_sha256 = / { print destination "|" $2 }' "$COMPAT/VENDOR-MANIFEST.toml")
}

verify_manifest_hashes

unexpected_path_deps="$(
  rg -n '(^|[[:space:]{,])path[[:space:]]*=' "$ROOT/bridge/Cargo.toml" "$COMPAT/Cargo.toml" \
    | grep -Ev 'path[[:space:]]*=[[:space:]]*"src/(main|lib)\.rs"' \
    | grep -Ev 'path[[:space:]]*=[[:space:]]*"\.\./vendor/herdr-compat"' \
    || true
)"
if [[ -n "$unexpected_path_deps" ]]; then
  echo "unexpected Cargo path dependency; only ../vendor/herdr-compat is allowed" >&2
  echo "$unexpected_path_deps" >&2
  exit 1
fi

if [[ -n "${HERDR_SRC:-}" ]]; then
  if [[ ! -d "$HERDR_SRC/src" ]]; then
    echo "HERDR_SRC must point at a Herdr checkout containing src/" >&2
    exit 1
  fi

  upstream_commit="$(git -C "$HERDR_SRC" rev-parse HEAD 2>/dev/null || true)"
  if [[ "$upstream_commit" != "$EXPECTED_HERDR_COMMIT" ]]; then
    echo "HERDR_SRC must be a Herdr v0.8.2 checkout at $EXPECTED_HERDR_COMMIT" >&2
    echo "found: ${upstream_commit:-not a git checkout}" >&2
    exit 1
  fi

  if [[ -n "$(git -C "$HERDR_SRC" status --short)" ]]; then
    echo "HERDR_SRC must be a clean Herdr v0.8.2 checkout" >&2
    git -C "$HERDR_SRC" status --short >&2
    exit 1
  fi

  compare_exact() {
    local upstream_rel="$1"
    local compat_rel="$2"
    if ! diff -q "$HERDR_SRC/$upstream_rel" "$COMPAT/$compat_rel" >/dev/null; then
      echo "Herdr compatibility copy drifted from HERDR_SRC: $compat_rel" >&2
      diff -u "$HERDR_SRC/$upstream_rel" "$COMPAT/$compat_rel" | sed -n '1,120p' >&2
      exit 1
    fi
  }

  check_terminal_attach_protocol() {
    if ! rg -q '^pub const PROTOCOL_VERSION: u32 = 20;' "$COMPAT/src/protocol/wire.rs"; then
      echo "terminal attach compatibility copy must advertise Herdr protocol 20" >&2
      exit 1
    fi
    for marker in AppDirectGraphics GraphicsTransmissionResult InputPixels GraphicsTransmissionStarted TerminalBell GraphicsFile GraphicsTransmissionRetired 'sgr_pixels: bool'; do
      if ! rg -q "$marker" "$COMPAT/src/protocol/wire.rs"; then
        echo "terminal attach compatibility copy is missing protocol-20 marker: $marker" >&2
        exit 1
      fi
    done
    if ! rg -q 'TerminalAttach' "$COMPAT/src/protocol/wire.rs"; then
      echo "terminal attach compatibility copy is missing TerminalAttach" >&2
      exit 1
    fi
  }

  compare_popup_size() {
    normalize_popup_size_visibility() {
      awk '
        $0 == "pub(crate) enum PopupSize {" || $0 == "pub enum PopupSize {" {
          print "pub enum PopupSize {"
          next
        }
        { print }
      ' "$1"
    }

    if ! diff -q \
      <(normalize_popup_size_visibility "$HERDR_SRC/src/popup_size.rs") \
      <(normalize_popup_size_visibility "$COMPAT/src/popup_size.rs") \
      >/dev/null; then
      echo "Herdr popup_size copy drifted from HERDR_SRC beyond the intentional PopupSize visibility adaptation" >&2
      diff -u \
        <(normalize_popup_size_visibility "$HERDR_SRC/src/popup_size.rs") \
        <(normalize_popup_size_visibility "$COMPAT/src/popup_size.rs") \
        | sed -n '1,120p' >&2
      exit 1
    fi
  }

  compare_exact "src/api/schema.rs" "src/api/schema.rs"
  while IFS= read -r -d '' upstream_schema_file; do
    file_name="$(basename "$upstream_schema_file")"
    case "$file_name" in
      tests.rs|tabs.rs|workspaces.rs)
        continue
        ;;
    esac
    compare_exact "src/api/schema/$file_name" "src/api/schema/$file_name"
  done < <(find "$HERDR_SRC/src/api/schema" -maxdepth 1 -type f -name '*.rs' -print0)
  compare_exact "src/protocol/wire.rs" "src/protocol/wire.rs"
  compare_popup_size
  check_terminal_attach_protocol

  echo "Herdr $EXPECTED_HERDR_RELEASE compatibility vendor layout and HERDR_SRC drift checks passed"
else
  echo "Herdr $EXPECTED_HERDR_RELEASE compatibility vendor layout and manifest hashes look clean"
  echo "Set HERDR_SRC=/path/to/clean/herdr-v0.8.2 to compare exact upstream schema/wire copies"
fi
