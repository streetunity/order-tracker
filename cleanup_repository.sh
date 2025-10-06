#!/bin/bash

# Order Tracker Repository Cleanup Script
# This script removes all redundant, old, and unnecessary files from the repository
# Total files to be removed: 62+

echo "==============================================="
echo "Order Tracker Repository Cleanup Script"
echo "This will remove 62+ unnecessary files"
echo "==============================================="
echo ""

# Safety check
read -p "Are you sure you want to delete these files? This cannot be undone! (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Cleanup cancelled."
    exit 0
fi

echo "Starting cleanup..."
echo ""

# Counter for deleted files
deleted=0
failed=0

# Function to delete a file
delete_file() {
    if [ -f "$1" ]; then
        rm -f "$1"
        if [ $? -eq 0 ]; then
            echo "✓ Deleted: $1"
            ((deleted++))
        else
            echo "✗ Failed to delete: $1"
            ((failed++))
        fi
    else
        echo "⊘ Not found: $1"
    fi
}

echo "=== Removing Windows Zone Identifier files ==="
delete_file ".gitignore:Zone.Identifier"

echo ""
echo "=== Removing empty/junk files ==="
delete_file "Created"
delete_file "FETCH_HEAD"
delete_file "Locked && ("
delete_file "ection style={{ marginTop: 8 }}>"

echo ""
echo "=== Removing old documentation files ==="
delete_file "AWS_COMPLETE_REFERENCE.md"
delete_file "AWS_DEPLOYMENT.md"
delete_file "DEPLOYMENT_50.19.66.100.md"
delete_file "DEPLOYMENT_NOTES.md"
delete_file "FILES_CREATED_INVENTORY.md"
delete_file "IMPLEMENTATION_COMPLETE_SUMMARY.md"
delete_file "MANUAL_IMPLEMENTATION_STEPS.md"
delete_file "MANUAL_UPDATE_PRICE_NOTES.md"
delete_file "MEASUREMENT_FEATURE_GUIDE.md"
delete_file "MEASUREMENT_INTEGRATION_GUIDE.md"
delete_file "QUICK_IMPLEMENTATION_GUIDE.md"
delete_file "README-MEASUREMENTS.md"
delete_file "README_AWS.md"
delete_file "REPORTING_IMPLEMENTATION_GUIDE.md"
delete_file "REPORTS_README.md"
delete_file "REPORT_RESPONSE_EXAMPLES.md"
delete_file "TROUBLESHOOTING.md"
delete_file "aws-deployment-guide.md"
delete_file "project-structure.txt"

echo ""
echo "=== Removing old deployment scripts ==="
delete_file "DEPLOY_FINAL.sh"
delete_file "apply-measurement-fix.sh"
delete_file "backup.sh"
delete_file "cleanup-duplicate-routes.sh"
delete_file "deploy-aws.sh"
delete_file "deploy-bulletproof.sh"
delete_file "deploy-ec2.sh"
delete_file "deploy-laser-wattage.sh"
delete_file "deploy-manual.sh"
delete_file "deploy-ordered-feature.sh"
delete_file "deploy-price-notes.sh"
delete_file "deploy-robust.sh"
delete_file "deploy-ultimate-fix.sh"
delete_file "deploy.sh"
delete_file "fix-aws-deployment.sh"
delete_file "fix-backend.sh"
delete_file "fix-common-issues.sh"
delete_file "fix-measurements-complete.sh"
delete_file "fix-slug-error.sh"
delete_file "fix_deployment.sh"
delete_file "install-dependencies.sh"
delete_file "integrate-reports.sh"
delete_file "quick-fix-measurements.sh"
delete_file "quick-reset.sh"
delete_file "quick-start.sh"
delete_file "quick_fix.sh"
delete_file "reset-database.sh"
delete_file "test-deployment.sh"
delete_file "update-api-routes.sh"
delete_file "verify-deployment.sh"
delete_file "verify-ec2.sh"

echo ""
echo "=== Removing unnecessary root-level files ==="
delete_file "package.json"
delete_file "package-lock.json"

echo ""
echo "=== Removing old scripts from scripts/ directory ==="
delete_file "scripts/add-customer-docs-link-edit-page.sh"
delete_file "scripts/auto-update-edit-order-page.sh"
delete_file "scripts/deploy-customer-docs-link.sh"
delete_file "scripts/fix-three-issues.sh"

echo ""
echo "=== Removing old files from web/ directory ==="
delete_file "web/EditableRow-update.jsx"
delete_file "web/apply-frontend-updates.sh"

echo ""
echo "==============================================="
echo "Cleanup Summary:"
echo "✓ Successfully deleted: $deleted files"
if [ $failed -gt 0 ]; then
    echo "✗ Failed to delete: $failed files"
fi
echo "==============================================="

echo ""
echo "Next steps:"
echo "1. Run: git add -A"
echo "2. Run: git commit -m 'Major cleanup: Remove 60+ redundant files'"
echo "3. Run: git push origin aws-deployment"
echo ""
echo "The repository is now clean!"
echo "Essential files kept:"
echo "  - README.md"
echo "  - DEPLOYMENT_DO_NOT_DELETE.md"
echo "  - deploy_DO_NOT_DELETE.sh"
echo "  - .gitignore"
echo "  - ecosystem.config.js (PM2 config)"
echo "  - api/ directory"
echo "  - web/ directory"
echo "  - api/scripts/backfill-eta-dates.js (utility script)"
