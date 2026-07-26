#!/bin/sh
# Energy Tech Crane - Import Product Master (Linux / Mac / Hostinger)
# Imports all 22 categories and the full hierarchy (400+ items).
# Safe to run repeatedly - it never creates duplicates.
#
# Usage:  sh import-products.sh     (from the project's "integrated" folder)

cd "$(dirname "$0")" || exit 1

echo "============================================================"
echo " Energy Tech Crane - Import Product Master"
echo " (22 categories, full hierarchy, 400+ items)"
echo "============================================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is not installed or not on PATH."
  exit 1
fi

node erp-server/src/db/seed-product-master.js || {
  echo ""
  echo "[ERROR] Import failed - see the message above."
  exit 1
}

echo ""
echo " Done. Open the ERP -> Materials / Categories to see them."
