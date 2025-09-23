#!/bin/bash
# check-deployment.sh - Check what's actually running vs what should be running

echo "=== Deployment Status Check ==="
echo ""

echo "1. Git Status:"
cd /var/www/order-tracker
git status --short
echo "   Branch: $(git branch --show-current)"
echo "   Last commit: $(git log -1 --oneline)"
echo ""

echo "2. PM2 Processes:"
pm2 list
echo ""

echo "3. Environment Files:"
echo "   API .env:"
if [ -f api/.env ]; then
  echo "     ✓ Exists"
  grep -E "JWT_SECRET|DATABASE_URL|PORT" api/.env | sed 's/=.*$/=***/' | sed 's/^/     /'
else
  echo "     ✗ Missing"
fi
echo ""
echo "   Frontend .env.local:"
if [ -f web/.env.local ]; then
  echo "     ✓ Exists"
  cat web/.env.local | sed 's/^/     /'
else
  echo "     ✗ Missing"
fi
echo ""

echo "4. API Test:"
curl -s -o /dev/null -w "   HTTP Status: %{http_code}\n" http://localhost:4000/auth/check
echo ""

echo "5. Database:"
if [ -f api/prisma/dev.db ]; then
  echo "   ✓ Database exists"
  echo "   Size: $(du -h api/prisma/dev.db | cut -f1)"
  echo "   Users count: $(sqlite3 api/prisma/dev.db 'SELECT COUNT(*) FROM User;' 2>/dev/null || echo 'Could not read')"
else
  echo "   ✗ Database missing"
fi
echo ""

echo "6. Recent PM2 Logs (last error):"
pm2 logs --nostream --lines 5 | grep -i error | tail -5
echo ""

echo "=== End Status Check ==="