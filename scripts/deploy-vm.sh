#!/usr/bin/env bash
# Builds the API bundle and the web app, then ships both to the Oracle VM (see LEIA-ME-MIGRACAO.md).
set -euo pipefail
cd "$(dirname "$0")/.."
URL=https://runclub.193-123-122-30.sslip.io
pnpm build
rm -rf dist
EXPO_PUBLIC_API_BASE_URL=$URL EXPO_BASE_URL= npx expo export --platform web
tar -czf - dist-server/index.mjs 2>/dev/null | ssh vm_deon 'tar -xzf - -C ~/run-club/api --strip-components=1 2>/dev/null && pm2 restart run-club-api --update-env >/dev/null'
tar -czf - -C dist . 2>/dev/null | ssh vm_deon 'rm -rf ~/run-club/web/* && tar -xzf - -C ~/run-club/web 2>/dev/null && chmod -R a+rX ~/run-club/web'
sleep 2
curl -fsS "$URL/api/health" && echo
