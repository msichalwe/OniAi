#!/usr/bin/env bash
# OniOS Native macOS Notification
# Usage: ./notify.sh "Title" "Message" ["subtitle"]
#
# Uses osascript to send native macOS notifications from OniOS.

TITLE="${1:-OniOS}"
MESSAGE="${2:-}"
SUBTITLE="${3:-}"

if [ -z "$MESSAGE" ]; then
    echo "Usage: notify.sh \"Title\" \"Message\" [\"Subtitle\"]"
    exit 1
fi

osascript -e "display notification \"$MESSAGE\" with title \"$TITLE\"$([ -n "$SUBTITLE" ] && echo " subtitle \"$SUBTITLE\"")"
