#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: scripts/package-tarball.sh VERSION [PLATFORM]" >&2
  echo "example: scripts/package-tarball.sh v0.1.0 linux-x86_64" >&2
  exit 2
fi

VERSION="$1"
PLATFORM="${2:-}"
VERSION_PATTERN='^v[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$'
if [[ ! "$VERSION" =~ $VERSION_PATTERN ]]; then
  echo "release version must match vX.Y.Z with an optional prerelease/build suffix" >&2
  exit 2
fi

if [[ -z "$PLATFORM" ]]; then
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$os:$arch" in
    linux:x86_64) PLATFORM="linux-x86_64" ;;
    darwin:arm64) PLATFORM="macos-arm64" ;;
    darwin:x86_64) PLATFORM="macos-x86_64" ;;
    *)
      echo "cannot infer platform for $os/$arch; pass PLATFORM explicitly" >&2
      exit 2
      ;;
  esac
fi

PLATFORM_PATTERN='^[A-Za-z0-9][A-Za-z0-9._-]*$'
if [[ ! "$PLATFORM" =~ $PLATFORM_PATTERN ]]; then
  echo "platform must be a safe single path component" >&2
  exit 2
fi

PKG_ROOT="$ROOT/dist-packages"
NAME="herdr-web-${VERSION}-${PLATFORM}"
mkdir -p "$PKG_ROOT"
PKG_ROOT_REAL="$(cd "$PKG_ROOT" && pwd -P)"
STAGE="$PKG_ROOT_REAL/$NAME"
ARCHIVE="$PKG_ROOT_REAL/$NAME.tar.gz"
if [[ "$(dirname "$STAGE")" != "$PKG_ROOT_REAL" || "$(dirname "$ARCHIVE")" != "$PKG_ROOT_REAL" ]]; then
  echo "release packaging path escaped dist-packages" >&2
  exit 2
fi

npm --prefix "$ROOT" run build:web
cargo build --release --manifest-path "$ROOT/bridge/Cargo.toml" --bin herdr-web-bridge

rm -rf -- "$STAGE" "$ARCHIVE" "$ARCHIVE.sha256"
mkdir -p "$STAGE/bin" "$STAGE/share/herdr-web/web"

cp "$ROOT/bridge/target/release/herdr-web-bridge" "$STAGE/bin/herdr-web-bridge"
cp -R "$ROOT/web/dist/." "$STAGE/share/herdr-web/web/"
cp "$ROOT/docs/tarball-readme.md" "$STAGE/README.md"

cat > "$STAGE/bin/herdr-web" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail

BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$BIN_DIR/.." && pwd)"

exec "$BIN_DIR/herdr-web-bridge" --static-dir "$ROOT/share/herdr-web/web" "$@"
WRAPPER
chmod +x "$STAGE/bin/herdr-web" "$STAGE/bin/herdr-web-bridge"

# Copy and validate the complete notice/provenance/SBOM/checksum material. The
# checker requires a clean tracked checkout and rejects missing metadata,
# undeclared members, secrets, local state, and workstation paths.
node "$ROOT/scripts/release-compliance.mjs" --prepare-desktop --root "$ROOT" --stage "$STAGE"

(
  cd "$PKG_ROOT"
  COPYFILE_DISABLE=1 tar -czf "$ARCHIVE" "$NAME"
  if command -v sha256sum >/dev/null; then
    sha256sum "$(basename "$ARCHIVE")" > "$ARCHIVE.sha256"
  elif command -v shasum >/dev/null; then
    shasum -a 256 "$(basename "$ARCHIVE")" > "$ARCHIVE.sha256"
  else
    echo "error: no SHA-256 tool found; release packaging cannot continue" >&2
    exit 1
  fi
)

echo "$ARCHIVE"
