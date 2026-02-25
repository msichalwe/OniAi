#!/usr/bin/env bash
set -euo pipefail

cd /repo

export ONI_STATE_DIR="/tmp/oni-test"
export ONI_CONFIG_PATH="${ONI_STATE_DIR}/oni.json"

echo "==> Build"
pnpm build

echo "==> Seed state"
mkdir -p "${ONI_STATE_DIR}/credentials"
mkdir -p "${ONI_STATE_DIR}/agents/main/sessions"
echo '{}' >"${ONI_CONFIG_PATH}"
echo 'creds' >"${ONI_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${ONI_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
pnpm oni reset --scope config+creds+sessions --yes --non-interactive

test ! -f "${ONI_CONFIG_PATH}"
test ! -d "${ONI_STATE_DIR}/credentials"
test ! -d "${ONI_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${ONI_STATE_DIR}/credentials"
echo '{}' >"${ONI_CONFIG_PATH}"

echo "==> Uninstall (state only)"
pnpm oni uninstall --state --yes --non-interactive

test ! -d "${ONI_STATE_DIR}"

echo "OK"
