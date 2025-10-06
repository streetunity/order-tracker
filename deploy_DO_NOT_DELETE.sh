#!/bin/bash

# Order Tracker Master Deployment Script - DO NOT DELETE
# This is the ONLY deployment script you need
# Usage: ./deploy_DO_NOT_DELETE.sh [backend|frontend|all|fix|reset]

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/var/www/order-tracker"
BRANCH="aws-deployment"

# Function to print colored messages
print_message() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Navigate to project directory
cd $PROJECT_DIR || { print_error "Failed to navigate to $PROJECT_DIR"; exit 1; }

# Function to pull latest changes
pull_changes() {
    print_message "Pulling latest changes from GitHub..."
    git pull origin $BRANCH || { print_error "Failed to pull from GitHub"; exit 1; }
}

# Function to deploy backend
deploy_backend() {
    print_message "Deploying backend..."
    cd $PROJECT_DIR/api
    
    # Check if schema.prisma was modified
    if git diff HEAD~1 --name-only | grep -q "schema.prisma"; then
        print_warning "Schema changes detected. Running migrations..."
        npx prisma migrate deploy || {
            print_warning "Migration failed, attempting db push..."
            npx prisma db push
        }
    fi
    
    npx prisma generate
    cd $PROJECT_DIR
    pm2 restart order-tracker-backend
    print_message "Backend deployed successfully!"
}

# Function to deploy frontend
deploy_frontend() {
    print_message "Deploying frontend..."
    cd $PROJECT_DIR/web
    
    # Clear Next.js cache for clean build
    rm -rf .next
    
    npm run build || { print_error "Frontend build failed"; exit 1; }
    cd $PROJECT_DIR
    pm2 restart order-tracker-frontend
    print_message "Frontend deployed successfully!"
}

# Function to deploy everything
deploy_all() {
    print_message "Starting full deployment..."
    pull_changes
    deploy_backend
    deploy_frontend
    print_message "Full deployment completed!"
}

# Function to fix common issues
fix_issues() {
    print_message "Running fix routine..."
    pull_changes
    
    # Clear caches
    print_message "Clearing caches..."
    rm -rf web/.next
    
    # Ensure database is synced
    print_message "Syncing database..."
    cd $PROJECT_DIR/api
    npx prisma db push
    npx prisma generate
    
    # Rebuild frontend
    print_message "Rebuilding frontend..."
    cd $PROJECT_DIR/web
    npm run build
    
    # Restart all services
    cd $PROJECT_DIR
    pm2 restart all
    
    print_message "Fix routine completed!"
}

# Function to reset everything
reset_deployment() {
    print_warning "Resetting deployment to clean state..."
    
    # Stash any local changes
    git stash
    
    # Reset to remote state
    git reset --hard origin/$BRANCH
    
    # Pull latest
    git pull origin $BRANCH
    
    # Clear all caches
    rm -rf web/.next
    
    # Reinstall dependencies if needed
    read -p "Reinstall dependencies? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_message "Reinstalling dependencies..."
        cd $PROJECT_DIR/api && npm install
        cd $PROJECT_DIR/web && npm install
    fi
    
    # Sync database
    cd $PROJECT_DIR/api
    npx prisma db push
    npx prisma generate
    
    # Build frontend
    cd $PROJECT_DIR/web
    npm run build
    
    # Restart everything
    cd $PROJECT_DIR
    pm2 restart all
    
    print_message "Reset completed!"
}

# Function to show logs
show_logs() {
    print_message "Showing recent logs..."
    pm2 logs --lines 30
}

# Function to check status
check_status() {
    print_message "Checking service status..."
    pm2 status
    
    # Check if services are running
    if pm2 list | grep -q "order-tracker-backend.*online"; then
        print_message "Backend is running ✓"
    else
        print_error "Backend is not running ✗"
    fi
    
    if pm2 list | grep -q "order-tracker-frontend.*online"; then
        print_message "Frontend is running ✓"
    else
        print_error "Frontend is not running ✗"
    fi
}

# Main script logic
case "${1:-all}" in
    backend)
        pull_changes
        deploy_backend
        show_logs
        ;;
    frontend)
        pull_changes
        deploy_frontend
        show_logs
        ;;
    all)
        deploy_all
        show_logs
        ;;
    fix)
        fix_issues
        show_logs
        ;;
    reset)
        reset_deployment
        show_logs
        ;;
    status)
        check_status
        ;;
    logs)
        show_logs
        ;;
    *)
        echo "Order Tracker Deployment Script"
        echo "Usage: $0 [backend|frontend|all|fix|reset|status|logs]"
        echo ""
        echo "Commands:"
        echo "  backend   - Deploy backend only"
        echo "  frontend  - Deploy frontend only"
        echo "  all       - Deploy both (default)"
        echo "  fix       - Fix common issues (cache, db sync)"
        echo "  reset     - Complete reset to GitHub state"
        echo "  status    - Check service status"
        echo "  logs      - Show recent logs"
        exit 1
        ;;
esac

# Final status check
check_status

print_message "Deployment script completed!"
