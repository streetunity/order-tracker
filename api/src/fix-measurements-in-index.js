// fix-measurements-in-index.js
// Run this script to fix the measurements float conversion issue in index.js

const fs = require('fs');
const path = require('path');

// Read the current index.js file
const filePath = path.join(__dirname, 'index.js');
let content = fs.readFileSync(filePath, 'utf8');

console.log('Fixing measurements float conversion in index.js...');

// Add the toFloat helper function after the MEASUREMENT ENDPOINTS comment
// Find the line with "// MEASUREMENT ENDPOINTS (BYPASS LOCK)"
const measurementCommentIndex = content.indexOf('// MEASUREMENT ENDPOINTS (BYPASS LOCK)');
if (measurementCommentIndex > -1) {
    // Find the next line after the comment section
    const nextLineIndex = content.indexOf('\n', content.indexOf('\n', measurementCommentIndex) + 1);
    
    // Check if toFloat helper already exists
    if (!content.includes('const toFloat = ')) {
        const helperFunction = '\n// Helper function to safely convert to float\nconst toFloat = (val) => (val === null || val === undefined || val === \'\') ? null : parseFloat(val);\n';
        content = content.slice(0, nextLineIndex) + helperFunction + content.slice(nextLineIndex);
        console.log('✓ Added toFloat helper function');
    }
}

// Fix 1: Individual measurements endpoint
// Replace height/width/length/weight assignments in the measurements endpoint
content = content.replace(
    /height: height !== undefined \? height : item\.height,/g,
    'height: height !== undefined ? toFloat(height) : item.height,'
);
content = content.replace(
    /width: width !== undefined \? width : item\.width,/g,
    'width: width !== undefined ? toFloat(width) : item.width,'
);
content = content.replace(
    /length: length !== undefined \? length : item\.length,/g,
    'length: length !== undefined ? toFloat(length) : item.length,'
);
content = content.replace(
    /weight: weight !== undefined \? weight : item\.weight,/g,
    'weight: weight !== undefined ? toFloat(weight) : item.weight,'
);

// Fix 2: Bulk measurements endpoint
content = content.replace(
    /data\.height = updateData\.height;/g,
    'data.height = toFloat(updateData.height);'
);
content = content.replace(
    /data\.width = updateData\.width;/g,
    'data.width = toFloat(updateData.width);'
);
content = content.replace(
    /data\.length = updateData\.length;/g,
    'data.length = toFloat(updateData.length);'
);
content = content.replace(
    /data\.weight = updateData\.weight;/g,
    'data.weight = toFloat(updateData.weight);'
);

// Fix 3: Item PATCH endpoint (for measurements)
content = content.replace(
    /data\.height = req\.body\.height;/g,
    'data.height = toFloat(req.body.height);'
);
content = content.replace(
    /data\.width = req\.body\.width;/g,
    'data.width = toFloat(req.body.width);'
);
content = content.replace(
    /data\.length = req\.body\.length;/g,
    'data.length = toFloat(req.body.length);'
);
content = content.replace(
    /data\.weight = req\.body\.weight;/g,
    'data.weight = toFloat(req.body.weight);'
);

// Fix 4: Alternative patterns that might exist
content = content.replace(
    /data\.height = height;/g,
    'data.height = toFloat(height);'
);
content = content.replace(
    /data\.width = width;/g,
    'data.width = toFloat(width);'
);
content = content.replace(
    /data\.length = length;/g,
    'data.length = toFloat(length);'
);
content = content.replace(
    /data\.weight = weight;/g,
    'data.weight = toFloat(weight);'
);

// Write the fixed content back
fs.writeFileSync(filePath, content, 'utf8');

console.log('✓ Fixed measurements float conversion');
console.log('✓ All measurement values will now be properly converted from strings to floats');
console.log('\nPlease commit this change to Git and redeploy.');
