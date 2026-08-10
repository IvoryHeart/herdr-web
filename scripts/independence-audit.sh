#!/usr/bin/env bash
set -euo pipefail

audit_dir="$(mktemp -d)"
trap 'rm -rf -- "$audit_dir"' EXIT

npm ls --all --json >"$audit_dir/npm-dependencies.json"
cargo metadata --manifest-path bridge/Cargo.toml --no-deps --format-version 1 \
  >"$audit_dir/cargo-dependencies.json"

if rg -n --glob '*.{ts,tsx,js,mjs,rs,json,toml}' \
  '(ai-observability|visualizations/|/api/world)' \
  web/src bridge/src vendor/herdr-compat/src package.json web/package.json bridge/Cargo.toml \
  vendor/herdr-compat/Cargo.toml; then
  echo "Herdr Web core contains a prohibited legacy visualization dependency" >&2
  exit 1
fi

if rg -n -i \
  '(ai-observability|visualizations|api/world)' \
  "$audit_dir/npm-dependencies.json" "$audit_dir/cargo-dependencies.json"; then
  echo "Herdr Web dependency graph contains a prohibited legacy visualization dependency" >&2
  exit 1
fi

if rg -n --glob '*.{ts,tsx,js,mjs,rs}' \
  '(dynamic plugin|plugin marketplace|fleet database|central gateway|second multiplexer)' \
  web/src bridge/src vendor/herdr-compat/src; then
  echo "Herdr Web core contains a prohibited control-plane or dynamic-loader implementation" >&2
  exit 1
fi

echo "Herdr Web independence audit passed"
