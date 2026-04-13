#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "[*] Refreshing feeds..."
cd "$PROJECT_ROOT/backend"
source ./cti_feed/bin/activate
python rss_aggregatory.py

echo "[*] Starting frontend..."
cd "$PROJECT_ROOT/frontend"
npm run dev