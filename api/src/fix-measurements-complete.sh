#!/bin/bash

# Add toFloat function if not present
if ! grep -q "function toFloat" index.js; then
  sed -i '47a\\n// Helper function to safely convert strings to floats for measurements\nfunction toFloat(value) {\n  if (value === null || value === undefined || value === '\'''\''') {\n    return null;\n  }\n  const num = parseFloat(value);\n  return isNaN(num) ? null : num;\n}\n' index.js
fi

# Fix individual measurements endpoint
sed -i 's/height: height !== undefined ? height :/height: height !== undefined ? toFloat(height) :/' index.js
sed -i 's/width: width !== undefined ? width :/width: width !== undefined ? toFloat(width) :/' index.js
sed -i 's/length: length !== undefined ? length :/length: length !== undefined ? toFloat(length) :/' index.js
sed -i 's/weight: weight !== undefined ? weight :/weight: weight !== undefined ? toFloat(weight) :/' index.js

# Fix bulk measurements endpoint
sed -i 's/data\.height = updateData\.height;/data.height = toFloat(updateData.height);/' index.js
sed -i 's/data\.width = updateData\.width;/data.width = toFloat(updateData.width);/' index.js
sed -i 's/data\.length = updateData\.length;/data.length = toFloat(updateData.length);/' index.js
sed -i 's/data\.weight = updateData\.weight;/data.weight = toFloat(updateData.weight);/' index.js

# Fix item PATCH endpoint measurements
sed -i 's/data\.height = req\.body\.height;/data.height = toFloat(req.body.height);/' index.js
sed -i 's/data\.width = req\.body\.width;/data.width = toFloat(req.body.width);/' index.js
sed -i 's/data\.length = req\.body\.length;/data.length = toFloat(req.body.length);/' index.js
sed -i 's/data\.weight = req\.body\.weight;/data.weight = toFloat(req.body.weight);/' index.js

echo "Measurements fix applied!"
