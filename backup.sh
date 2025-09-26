#!/bin/bash
BACKUP_DIR="/var/www/order-tracker/backups"
DB_FILE="/var/www/order-tracker/api/prisma/dev.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
cp $DB_FILE $BACKUP_DIR/backup_$TIMESTAMP.db
# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup_*.db" -mtime +7 -delete
