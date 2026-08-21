#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -ne 1 ]]; then
  echo "usage: scripts/package-source.sh VERSION" >&2
  echo "example: scripts/package-source.sh v0.1.0" >&2
  exit 2
fi

VERSION="$1"
VERSION_PATTERN='^v[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$'
if [[ ! "$VERSION" =~ $VERSION_PATTERN ]]; then
  echo "release version must match vX.Y.Z with an optional prerelease/build suffix" >&2
  exit 2
fi

PKG_ROOT="$ROOT/dist-packages"
NAME="herdr-world-${VERSION}-source"
mkdir -p "$PKG_ROOT"
PKG_ROOT_REAL="$(cd "$PKG_ROOT" && pwd -P)"
STAGE="$PKG_ROOT_REAL/$NAME"
ARCHIVE="$PKG_ROOT_REAL/$NAME.tar.gz"
if [[ "$(dirname "$STAGE")" != "$PKG_ROOT_REAL" || "$(dirname "$ARCHIVE")" != "$PKG_ROOT_REAL" ]]; then
  echo "release packaging path escaped dist-packages" >&2
  exit 2
fi

node "$ROOT/scripts/release-compliance.mjs" --check --root "$ROOT" --check-clean
rm -rf -- "$STAGE" "$ARCHIVE" "$ARCHIVE.sha256"
mkdir -p "$STAGE"

git -C "$ROOT" archive --format=tar HEAD | tar -xf - -C "$STAGE"
node "$ROOT/scripts/release-compliance.mjs" --prepare-source --root "$ROOT" --stage "$STAGE"

(
  cd "$PKG_ROOT"
  COPYFILE_DISABLE=1 tar -czf "$ARCHIVE" "$NAME"
  if command -v sha256sum >/dev/null; then
    sha256sum "$(basename "$ARCHIVE")" > "$ARCHIVE.sha256"
  elif command -v shasum >/dev/null; then
    shasum -a 256 "$(basename "$ARCHIVE")" > "$ARCHIVE.sha256"
  else
    echo "error: no SHA-256 tool found; source packaging cannot continue" >&2
    exit 1
  fi
)

echo "$ARCHIVE"
