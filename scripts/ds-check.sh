#!/bin/bash
# ─────────────────────────────────────────────────────────────
# ds:check — Aura-board Design System compliance checker
# Detects hardcoded hex colors outside base.css
#
# Usage:
#   bash scripts/ds-check.sh
#   npm run ds:check        (after adding to package.json)
#
# Exit codes:
#   0 = clean
#   1 = hardcoded hex found
# ─────────────────────────────────────────────────────────────

CDIR="src/styles"
BASE="$CDIR/base.css"

echo "━━━ ds:check — Design System Compliance ━━━"
echo ""

HITS=$(grep -rn '#[0-9a-fA-F]\{6\}' "$CDIR" \
  --include='*.css' \
  --exclude="$BASE" \
  2>/dev/null | grep -v 'node_modules')

echo "▸ Hardcoded hex colors (outside base.css):"
if [ -z "$HITS" ]; then
  echo "  ✅ None found"
  exit 0
else
  echo "$HITS"
  echo ""
  echo "━━━ ⚠️  Fix: replace with var(--color-*) token ━━━"
  exit 1
fi
