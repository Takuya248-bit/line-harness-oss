#!/bin/bash
set -e

PLIST_SRC="/Users/kimuratakuya/line-harness/scripts/com.notion-obsidian-sync.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.notion-obsidian-sync.plist"

echo "Copying plist to LaunchAgents..."
cp "$PLIST_SRC" "$PLIST_DEST"

echo "Loading launchd agent..."
launchctl load "$PLIST_DEST"

echo "Current status:"
launchctl list | grep notion-obsidian-sync || echo "(not found — may need re-login)"

echo "Done. Runs daily at 06:00 JST (21:00 UTC)."
