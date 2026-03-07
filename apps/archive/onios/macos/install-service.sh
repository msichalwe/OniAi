#!/usr/bin/env bash
set -euo pipefail

# OniOS macOS Service Installer
# Installs OniOS as a launchd user agent that starts at login.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ONIOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLIST_SRC="$SCRIPT_DIR/ai.oni.onios.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/ai.oni.onios.plist"
LABEL="ai.oni.onios"

echo "🦊 OniOS macOS Service Installer"
echo "================================="
echo ""

# Check prerequisites
if ! command -v node &>/dev/null; then
    echo "❌ Node.js not found. Install it first."
    exit 1
fi

if [ ! -d "$ONIOS_DIR/node_modules" ]; then
    echo "📦 Installing dependencies..."
    cd "$ONIOS_DIR" && npm install
fi

NODE_PATH="$(command -v node)"
VITE_PATH="$ONIOS_DIR/node_modules/.bin/vite"

if [ ! -f "$VITE_PATH" ]; then
    echo "❌ Vite not found at $VITE_PATH. Run npm install first."
    exit 1
fi

# Stop existing service if running
if launchctl list "$LABEL" &>/dev/null 2>&1; then
    echo "⏹  Stopping existing OniOS service..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

# Generate plist from template
echo "📝 Generating launchd plist..."
mkdir -p "$HOME/Library/LaunchAgents"

sed \
    -e "s|ONIOS_DIR_PLACEHOLDER|$ONIOS_DIR|g" \
    -e "s|HOME_PLACEHOLDER|$HOME|g" \
    -e "s|/usr/local/bin/node|$NODE_PATH|g" \
    -e "s|/usr/local/lib/node_modules/vite/bin/vite.js|$VITE_PATH|g" \
    "$PLIST_SRC" > "$PLIST_DEST"

# Load and start the service
echo "🚀 Loading OniOS service..."
launchctl load -w "$PLIST_DEST"

# Wait a moment and check if it started
sleep 2
if curl -s http://127.0.0.1:5173 &>/dev/null; then
    echo ""
    echo "✅ OniOS is running at http://localhost:5173"
    echo "   Service: $LABEL"
    echo "   Plist:   $PLIST_DEST"
    echo "   Logs:    /tmp/onios.stdout.log"
    echo ""
    echo "🦊 OniOS will start automatically on login."
else
    echo ""
    echo "⚠️  Service loaded but OniOS may still be starting."
    echo "   Check logs: tail -f /tmp/onios.stdout.log"
    echo "   Check errors: tail -f /tmp/onios.stderr.log"
fi

echo ""
echo "Commands:"
echo "  Stop:    launchctl unload ~/Library/LaunchAgents/ai.oni.onios.plist"
echo "  Start:   launchctl load ~/Library/LaunchAgents/ai.oni.onios.plist"
echo "  Restart: launchctl kickstart -k gui/\$(id -u)/ai.oni.onios"
echo "  Logs:    tail -f /tmp/onios.stdout.log"
