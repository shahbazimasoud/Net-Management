#!/usr/bin/env bash

# NetTopology Uninstaller Script
if [ "$EUID" -ne 0 ]; then
  echo "لطفاً با دسترسی root یا sudo اجرا نمایید: sudo bash uninstall.sh"
  exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="/etc/nettopology-backup"

echo "در حال تهیه پشتیبان پایدار از اسناد، پیوست‌ها و تنظیمات در $BACKUP_DIR..."
mkdir -p "$BACKUP_DIR" 2>/dev/null || true
[ -d "$APP_DIR/backend/uploads" ] && mkdir -p "$BACKUP_DIR/uploads" && cp -rpf "$APP_DIR/backend/uploads"/. "$BACKUP_DIR/uploads/" 2>/dev/null || true
[ -f "$APP_DIR/backend/network_data.json" ] && cp -f "$APP_DIR/backend/network_data.json" "$BACKUP_DIR/network_data.json" 2>/dev/null || true
[ -f "$APP_DIR/backend/database_store.json" ] && cp -f "$APP_DIR/backend/database_store.json" "$BACKUP_DIR/database_store.json" 2>/dev/null || true
[ -f "$APP_DIR/.env" ] && cp -f "$APP_DIR/.env" "$BACKUP_DIR/.env" 2>/dev/null || true
[ -f "$APP_DIR/backend/security/.secret.key" ] && cp -f "$APP_DIR/backend/security/.secret.key" "$BACKUP_DIR/.secret.key" 2>/dev/null || true

echo "در حال متوقف‌سازی و حذف سرویس nettopology..."
systemctl stop nettopology.service 2>/dev/null || true
systemctl disable nettopology.service 2>/dev/null || true
rm -f /etc/systemd/system/nettopology.service
systemctl daemon-reload

pkill -f "dist/server.cjs" || true
pkill -f "server.py" || true

echo "سرویس با موفقیت حذف شد."
echo "کلیه فایل‌های پوشه آپلود و قراردادها و پایگاه‌های داده در مسیر $BACKUP_DIR محفوظ ماندند و با نصب مجدد بازیابی خواهند شد."

