#!/bin/bash
# Update all API route files to use environment variable

echo "Updating API route files to use NEXT_PUBLIC_API_URL..."

# Find all route.js files in the web/app/api directory and update them
find web/app/api -name "route.js" -type f | while read file; do
  echo "Updating $file"
  
  # Check if file contains the localhost URL
  if grep -q "const backendUrl = 'http://localhost:4000'" "$file"; then
    # Replace with environment variable
    sed -i "s|const backendUrl = 'http://localhost:4000'|const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'|g" "$file"
    echo "  ✓ Updated $file"
  elif grep -q "const backendUrl = process.env.NEXT_PUBLIC_API_URL" "$file"; then
    echo "  → Already updated"
  else
    echo "  → No changes needed"
  fi
done

echo "Done updating API routes!"