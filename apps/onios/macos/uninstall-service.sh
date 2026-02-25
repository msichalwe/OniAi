#!/usr/bin/env bash
set -euo pipefail

# OniOS macOS Service Uninstaller

LABEL="ai.oni.onios"
PLIST_DEST="$HOME/Library/LaunchAgents/ai.oni.onios.plist"

echo "🦊 OniOS macOS Service Uninstaller"
echo "==================================="
echo ""

if [ ! -f "$PLIST_DEST" ]; then
    echo "ℹ️  OniOS service not installed."
    exit 0
fi

echo "⏹  Stopping OniOS service..."
launchctl unload "$PLIST_DEST" 2>/dev/null || true

echo "🗑  Removing plist..."
rm -f "$PLIST_DEST"

echo ""
echo "✅ OniOS service removed."
echo "   OniOS will no longer start on login."
