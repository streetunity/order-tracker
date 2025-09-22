#!/bin/bash
# API Routes Audit Script - Checks for common issues in API routes

echo "API Routes Health Check for Order Tracker"
echo "=========================================="
echo ""

# Function to check API routes
check_api_routes() {
    echo "Checking API routes for common issues..."
    echo ""
    
    # Find all route.js files in the API directory
    find web/app/api -name "route.js" -type f | while read file; do
        echo "Checking: $file"
        
        # Check for hardcoded localhost
        if grep -q "localhost:4000" "$file"; then
            echo "  ❌ WARNING: Hardcoded localhost:4000 found!"
        fi
        
        # Check for consistent environment variables
        if grep -q "backendUrl" "$file"; then
            echo "  ⚠️  Uses 'backendUrl' variable (should use API_BASE)"
        fi
        
        # Check if using NextResponse
        if ! grep -q "NextResponse" "$file"; then
            echo "  ⚠️  Not using NextResponse (using old Response API)"
        fi
        
        # Check for proper error handling
        if ! grep -q "content-type" "$file" && grep -q "await.*\.json()" "$file"; then
            echo "  ⚠️  May not handle empty JSON responses properly"
        fi
        
        echo ""
    done
}

# Function to fix common issues
fix_api_routes() {
    echo "Applying automatic fixes where possible..."
    echo ""
    
    # Replace localhost:4000 with environment variable
    find web/app/api -name "route.js" -type f -exec grep -l "localhost:4000" {} \; | while read file; do
        echo "Fixing hardcoded localhost in: $file"
        sed -i.bak 's|http://localhost:4000|${API_BASE}|g' "$file"
        
        # Add API_BASE declaration if not present
        if ! grep -q "const API_BASE" "$file"; then
            sed -i.bak '1a\
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.API_BASE || "http://localhost:4000";\
' "$file"
        fi
    done
    
    # Replace backendUrl with API_BASE
    find web/app/api -name "route.js" -type f -exec grep -l "backendUrl" {} \; | while read file; do
        echo "Fixing variable name in: $file"
        sed -i.bak 's/backendUrl/API_BASE/g' "$file"
        sed -i.bak 's/const API_BASE = process\.env\.NEXT_PUBLIC_API_BASE/const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.API_BASE/g' "$file"
    done
    
    # Clean up backup files
    find web/app/api -name "*.bak" -type f -delete
    
    echo ""
    echo "Fixes applied!"
}

# Main execution
cd /var/www/order-tracker

echo "1. Running API routes audit..."
check_api_routes > api-audit.log
cat api-audit.log

echo ""
echo "2. Summary of issues found:"
echo "   Hardcoded localhost: $(grep -c "Hardcoded localhost" api-audit.log)"
echo "   Inconsistent variables: $(grep -c "backendUrl" api-audit.log)"
echo "   Old Response API: $(grep -c "Not using NextResponse" api-audit.log)"
echo "   Missing error handling: $(grep -c "empty JSON" api-audit.log)"

echo ""
echo "Audit complete! Check api-audit.log for details."
echo ""
echo "To apply fixes, run: ./api-routes-audit.sh --fix"

# Check if fix flag is provided
if [ "$1" == "--fix" ]; then
    echo ""
    echo "Applying fixes..."
    fix_api_routes
fi