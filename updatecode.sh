#!/bin/bash
# =============================================================
# Order Tracker Deployment Script
# Usage: updatecode [frontend|backend|all]
# Default: auto-detects what changed and deploys accordingly
# =============================================================

set -e

# Configuration
PROJECT_DIR="/var/www/order-tracker"
BRANCH="feature/invoicing-port"
FRONTEND_DIR="$PROJECT_DIR/web"
BACKEND_DIR="$PROJECT_DIR/api"
LOG_FILE="/var/log/order-tracker-deploy.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo -e "$msg"
  echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

error() {
  log "${RED}ERROR: $1${NC}"
}

success() {
  log "${GREEN}✅ $1${NC}"
}

warn() {
  log "${YELLOW}⚠️  $1${NC}"
}

info() {
  log "${BLUE}→ $1${NC}"
}

# Header
echo ""
echo -e "${RED}============================================${NC}"
echo -e "${RED}  Order Tracker Deploy${NC}"
echo -e "${RED}============================================${NC}"
echo ""

# Check we're able to access project dir
if [ ! -d "$PROJECT_DIR" ]; then
  error "Project directory not found: $PROJECT_DIR"
  exit 1
fi

cd "$PROJECT_DIR"

# Get current commit before pull
OLD_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
info "Current commit: $OLD_COMMIT"

# Pull latest changes
info "Pulling from $BRANCH..."
PULL_OUTPUT=$(git pull origin "$BRANCH" 2>&1)

if echo "$PULL_OUTPUT" | grep -q "Already up to date"; then
  echo ""
  success "Already up to date. Nothing to deploy."
  echo ""
  exit 0
fi

echo "$PULL_OUTPUT"
NEW_COMMIT=$(git rev-parse --short HEAD)
info "Updated to commit: $NEW_COMMIT"

# Determine what changed
CHANGED_FILES=$(git diff --name-only "$OLD_COMMIT" "$NEW_COMMIT" 2>/dev/null || echo "")

HAS_FRONTEND=false
HAS_BACKEND=false
HAS_PRISMA=false

if echo "$CHANGED_FILES" | grep -q "^web/"; then
  HAS_FRONTEND=true
fi

if echo "$CHANGED_FILES" | grep -q "^api/"; then
  HAS_BACKEND=true
fi

if echo "$CHANGED_FILES" | grep -q "schema.prisma"; then
  HAS_PRISMA=true
fi

# Allow manual override
MODE="${1:-auto}"

if [ "$MODE" = "frontend" ]; then
  HAS_FRONTEND=true
  HAS_BACKEND=false
  HAS_PRISMA=false
elif [ "$MODE" = "backend" ]; then
  HAS_FRONTEND=false
  HAS_BACKEND=true
elif [ "$MODE" = "all" ]; then
  HAS_FRONTEND=true
  HAS_BACKEND=true
fi

echo ""
info "Changes detected:"
[ "$HAS_FRONTEND" = true ] && echo "  • Frontend (web/)"
[ "$HAS_BACKEND" = true ] && echo "  • Backend (api/)"
[ "$HAS_PRISMA" = true ] && echo "  • Database schema (prisma)"
echo ""

# ---- PRISMA SCHEMA UPDATE ----
if [ "$HAS_PRISMA" = true ]; then
  info "Schema change detected — running Prisma db push..."
  cd "$BACKEND_DIR"
  
  if npx prisma db push 2>&1; then
    success "Database schema updated"
  else
    error "Prisma db push failed!"
    warn "Backend may not work correctly until schema is resolved."
  fi
  
  info "Regenerating Prisma client..."
  npx prisma generate 2>&1
  success "Prisma client regenerated"
  cd "$PROJECT_DIR"
fi

# ---- BACKEND DEPLOY ----
if [ "$HAS_BACKEND" = true ]; then
  info "Restarting backend..."
  
  if pm2 restart order-tracker-backend 2>&1; then
    success "Backend restarted"
  else
    error "Backend restart failed!"
    pm2 logs order-tracker-backend --lines 10 --nostream
    exit 1
  fi
fi

# ---- FRONTEND DEPLOY (safe build) ----
if [ "$HAS_FRONTEND" = true ]; then
  info "Building frontend (this may take a minute)..."
  cd "$FRONTEND_DIR"
  
  # Back up current build
  if [ -d ".next" ]; then
    info "Backing up current build..."
    rm -rf .next-backup
    cp -r .next .next-backup
  fi
  
  # Clear cache and build
  rm -rf .next
  
  if npm run build 2>&1; then
    success "Frontend build succeeded"
    
    # Clean up backup
    rm -rf .next-backup
    
    # Restart frontend
    info "Restarting frontend..."
    if pm2 restart order-tracker-frontend 2>&1; then
      success "Frontend restarted"
    else
      error "Frontend restart failed!"
      pm2 logs order-tracker-frontend --lines 10 --nostream
      exit 1
    fi
  else
    error "Frontend build FAILED!"
    
    # Rollback
    if [ -d ".next-backup" ]; then
      warn "Rolling back to previous build..."
      rm -rf .next
      mv .next-backup .next
      pm2 restart order-tracker-frontend 2>/dev/null || true
      success "Rolled back to previous build. Site is still running."
    else
      error "No backup available. Frontend is DOWN."
      error "Fix the build error and run: updatecode frontend"
    fi
    
    exit 1
  fi
  
  cd "$PROJECT_DIR"
fi

# ---- STATUS CHECK ----
echo ""
info "PM2 Status:"
pm2 status
echo ""

# Summary
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Deploy Complete: $OLD_COMMIT → $NEW_COMMIT${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
