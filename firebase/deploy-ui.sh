#!/usr/bin/env bash
# Update only the authenticated workspace and login screen. Keep the existing
# API, job processor, data, security rules, IAM and secrets as deployed.
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci --ignore-scripts
npm test
npm ci --ignore-scripts --prefix .firebase-build/functions
npx -y firebase-tools@latest deploy \
  --project startupos-6b8d4 --config firebase.migration.json \
  --only functions:startupos:startupWeb,hosting --non-interactive
printf '%s\n' 'StartupOS UI updated: https://startupos-6b8d4.web.app'
