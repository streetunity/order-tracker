// fix-measurements.js
// This script patches the measurement endpoints to handle string-to-number conversion
// Run with: node fix-measurements.js

import fs from 'fs';

const filePath = './src/index.js';
const content = fs.readFileSync(filePath, 'utf8');

// Find and replace the measurement update sections
const fixedContent = content.replace(
  /data: \{\s*height: height !== undefined \? height : item\.height,\s*width: width !== undefined \? width : item\.width,\s*length: length !== undefined \? length : item\.length,\s*weight: weight !== undefined \? weight : item\.weight,/g,
  `data: {
          height: height !== undefined ? (height === null ? null : Number(height)) : item.height,
          width: width !== undefined ? (width === null ? null : Number(width)) : item.width,
          length: length !== undefined ? (length === null ? null : Number(length)) : item.length,
          weight: weight !== undefined ? (weight === null ? null : Number(weight)) : item.weight,`
);

// Also fix the item update endpoint
const fixedContent2 = fixedContent.replace(
  /data\.height = req\.body\.height;/g,
  'data.height = req.body.height === null ? null : Number(req.body.height);'
).replace(
  /data\.width = req\.body\.width;/g,
  'data.width = req.body.width === null ? null : Number(req.body.width);'
).replace(
  /data\.length = req\.body\.length;/g,
  'data.length = req.body.length === null ? null : Number(req.body.length);'
).replace(
  /data\.weight = req\.body\.weight;/g,
  'data.weight = req.body.weight === null ? null : Number(req.body.weight);'
);

// Write the fixed content
fs.writeFileSync(filePath, fixedContent2);

console.log('✓ Fixed measurement endpoints to convert strings to numbers');
console.log('✓ Changes applied to:', filePath);
console.log('\nNext steps:');
console.log('1. Restart the API: pm2 restart order-tracker-backend');
console.log('2. Test measurements again');
