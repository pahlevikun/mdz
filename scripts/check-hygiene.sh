#!/usr/bin/env bash
# Repo hygiene gate: no other tool or upstream media names in the shipped tree.
# Fails loudly. Run from the repo root. Used by Phase 0 and by CI later.
set -uo pipefail

BANNED='markdownload|markdowner|md-this-page|cpdown|competitor|the video|youtube'

hits=$(grep -rniE "$BANNED" \
  --include="*.ts" --include="*.tsx" --include="*.md" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=build \
  --exclude-dir=.plasmo --exclude-dir=dist \
  . 2>/dev/null)

if [ -n "$hits" ]; then
  echo "hygiene: banned references found"
  echo "$hits"
  exit 1
fi

echo "hygiene: clean"
