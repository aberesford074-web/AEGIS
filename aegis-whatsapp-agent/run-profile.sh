#!/bin/zsh
PROFILE_NAME="${1:-aaron}"
cd /Users/aaronberesford/Desktop/AEGIS/aegis-whatsapp-agent || exit 1
export PROFILE="$PROFILE_NAME"
exec /Users/aaronberesford/Documents/Codex/2026-05-14/files-mentioned-by-the-user-6db5826ea4b348e300439c903e51334a0ef87e7d69925a608d9d/node-v25.9.0-darwin-arm64/bin/node src/server.js
