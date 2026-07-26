#!/bin/bash
# Daily MySQL backup for the ERP database.
#
# What it does:
#   - Dumps the full database to a compressed .sql.gz file with a date stamp
#   - Keeps the last 30 days, deletes anything older
#
# Setup (one time):
#   1. Copy this file to your server, e.g. /home/erp/backup-db.sh
#   2. chmod +x backup-db.sh
#   3. Fill in the DB_* values below (same as erp-server/.env)
#   4. Add to crontab so it runs every night:
#        crontab -e
#        0 2 * * * /home/erp/backup-db.sh >> /home/erp/backup.log 2>&1
#
# Restoring from a backup:
#   gunzip -c backups/erp_2026-07-15.sql.gz | mysql -u USER -p DB_NAME

set -euo pipefail

DB_HOST="localhost"
DB_PORT="3306"
DB_USER="your_db_user"
DB_PASSWORD="your_db_password"
DB_NAME="your_db_name"

BACKUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backups"
DATE=$(date +%F)
KEEP_DAYS=30

mkdir -p "$BACKUP_DIR"

mysqldump \
  --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --password="$DB_PASSWORD" \
  --single-transaction --quick --routines --triggers \
  "$DB_NAME" | gzip > "$BACKUP_DIR/erp_${DATE}.sql.gz"

echo "[$(date)] Backup written to $BACKUP_DIR/erp_${DATE}.sql.gz"

# Remove backups older than KEEP_DAYS
find "$BACKUP_DIR" -name 'erp_*.sql.gz' -mtime +"$KEEP_DAYS" -delete

echo "[$(date)] Old backups cleaned up (kept last $KEEP_DAYS days)"
