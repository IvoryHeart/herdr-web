#!/usr/bin/env bash
set -euo pipefail

session="${HERDR_WEB_LIVE_SESSION:-}"
bridge="${HERDR_WEB_LIVE_BRIDGE:-}"
herdr_bin="${HERDR_BIN:-herdr}"

if [[ -z "$session" || -z "$bridge" ]]; then
  echo "set HERDR_WEB_LIVE_SESSION and HERDR_WEB_LIVE_BRIDGE to a disposable named Herdr session" >&2
  exit 2
fi

herdr_command() {
  env \
    -u HERDR_ENV \
    -u HERDR_PANE_ID \
    -u HERDR_TAB_ID \
    -u HERDR_WORKSPACE_ID \
    -u HERDR_SOCKET_PATH \
    "$herdr_bin" --session "$session" "$@"
}

workspace_id=""
cleanup() {
  if [[ -n "$workspace_id" ]]; then
    herdr_command workspace close "$workspace_id" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

wait_for_snapshot() {
  local filter="$1"
  local attempt
  for attempt in $(seq 1 50); do
    if curl --fail --silent --show-error "$bridge/api/snapshot" | jq -e "$filter" >/dev/null; then
      return 0
    fi
    sleep 0.1
  done
  echo "bridge snapshot did not reconcile: $filter" >&2
  return 1
}

created="$(
  herdr_command workspace create \
    --cwd "$PWD" \
    --label spec010-external-created \
    --focus
)"
workspace_id="$(jq -er '.result.workspace.workspace_id' <<<"$created")"
source_pane_id="$(jq -er '.result.root_pane.pane_id' <<<"$created")"
wait_for_snapshot ".workspaces[] | select(.workspace_id == \"$workspace_id\" and .label == \"spec010-external-created\" and .focused == true)"

herdr_command workspace rename "$workspace_id" spec010-external-renamed >/dev/null
wait_for_snapshot ".workspaces[] | select(.workspace_id == \"$workspace_id\" and .label == \"spec010-external-renamed\")"

created_tab="$(
  herdr_command tab create \
    --workspace "$workspace_id" \
    --cwd "$PWD" \
    --label spec010-external-tab \
    --no-focus
)"
target_tab_id="$(jq -er '.result.tab.tab_id' <<<"$created_tab")"
target_pane_id="$(jq -er '.result.root_pane.pane_id' <<<"$created_tab")"
wait_for_snapshot ".tabs[] | select(.tab_id == \"$target_tab_id\" and .label == \"spec010-external-tab\")"

split="$(
  herdr_command pane split "$source_pane_id" \
    --direction right \
    --cwd "$PWD" \
    --no-focus
)"
moved_pane_id="$(jq -er '.result.pane.pane_id' <<<"$split")"
wait_for_snapshot ".panes[] | select(.pane_id == \"$moved_pane_id\" and .tab_id != \"$target_tab_id\")"

herdr_command pane move "$moved_pane_id" \
  --tab "$target_tab_id" \
  --split right \
  --target-pane "$target_pane_id" \
  --focus >/dev/null
wait_for_snapshot ".panes[] | select(.pane_id == \"$moved_pane_id\" and .tab_id == \"$target_tab_id\" and .focused == true)"

herdr_command workspace focus "$workspace_id" >/dev/null
wait_for_snapshot ".workspaces[] | select(.workspace_id == \"$workspace_id\" and .focused == true)"

herdr_command workspace close "$workspace_id" >/dev/null
wait_for_snapshot "([.workspaces[].workspace_id] | index(\"$workspace_id\")) == null"
workspace_id=""

jq -n \
  --arg session "$session" \
  --arg bridge "$bridge" \
  --arg workspace "$workspace_id" \
  --arg tab "$target_tab_id" \
  --arg pane "$moved_pane_id" \
  '{session: $session, bridge: $bridge, externalCreate: "reconciled", externalRename: "reconciled", externalMove: "reconciled", externalFocus: "reconciled", externalClose: "reconciled", nativeTargets: {tab: $tab, pane: $pane}}'
