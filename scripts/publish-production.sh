#!/usr/bin/env bash
# Publicerar till https://minplanering.pages.dev. Vägrar om koden inte är exakt den som ligger på origin/main.
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch origin main --quiet
if [ -n "$(git status --porcelain)" ]; then echo "Avbrutet: arbetskopian har ändringar som inte är committade."; exit 1; fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then echo "Avbrutet: HEAD är inte origin/main. Publicera endast godkänd kod från main."; exit 1; fi
npm run check
npx vite build
npx wrangler pages deploy dist --project-name minplanering --branch main --commit-dirty=false
