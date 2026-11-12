#!/usr/bin/env bash
# Publicerar till https://minplanering.pages.dev. Vägrar om koden inte är exakt den som ligger på origin/main.
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch origin main --quiet
if [ -n "$(git status --porcelain)" ]; then echo "Avbrutet: arbetskopian har ändringar som inte är committade."; exit 1; fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then echo "Avbrutet: HEAD är inte origin/main. Publicera endast godkänd kod från main."; exit 1; fi
npm run check
# Produktionsbygget får endast peka mot produktionsprojektet genom uttryckliga värden (se src/supabase.js).
export VITE_SUPABASE_URL=https://siirwdmgbxwycndrxduu.supabase.co
export VITE_SUPABASE_ANON_KEY=sb_publishable_rxWH5Fp9KCEQ0madyKmjWw_uhIG5SiM
npx vite build
npx wrangler pages deploy dist --project-name minplanering --branch main --commit-dirty=false
