#!/bin/bash

# Manual API update script for laserWattage field
# Run this from the api directory

echo "Updating API to support laserWattage field..."

# Backup the original file
cp src/index.js src/index.js.backup

# Apply the changes using sed commands

# 1. Add laserWattage to normalizeIncomingItems function
sed -i '/voltage: i?.voltage ? String(i.voltage).trim() : null,/a\      laserWattage: i?.laserWattage ? String(i.laserWattage).trim() : null,' src/index.js

# 2. Add laserWattage to public order endpoint
sed -i '/voltage: it.voltage,/a\        laserWattage: it.laserWattage,' src/index.js

# 3. Add laserWattage to the PATCH endpoint select statement
sed -i '/voltage: true,/a\        laserWattage: true,' src/index.js

# 4. Add laserWattage processing in PATCH endpoint (this is complex, doing it in parts)
# First, find the line number after voltage processing
LINE=$(grep -n "if (req.body.hasOwnProperty('voltage'))" src/index.js | tail -1 | cut -d: -f1)
# Add 15 lines to get past the voltage block
INSERT_LINE=$((LINE + 15))

# Create the laserWattage processing block
cat > /tmp/laserWattage_patch.txt << 'EOF'
    
    if (req.body.hasOwnProperty('laserWattage')) {
      const newLaserWattage = (req.body.laserWattage === '' || req.body.laserWattage === null)
        ? null
        : String(req.body.laserWattage).trim();
      
      if (newLaserWattage !== item.laserWattage) {
        data.laserWattage = newLaserWattage;
        changes.push({
          field: 'laserWattage',
          oldValue: item.laserWattage || 'null',
          newValue: newLaserWattage || 'null'
        });
      }
    }
EOF

# Insert the laserWattage processing block
sed -i "${INSERT_LINE}r /tmp/laserWattage_patch.txt" src/index.js

# Clean up temp file
rm /tmp/laserWattage_patch.txt

echo "✅ API updated with laserWattage field support!"
echo ""
echo "Changes made:"
echo "1. Added laserWattage to normalizeIncomingItems"
echo "2. Added laserWattage to public order endpoint"
echo "3. Added laserWattage to PATCH endpoint select"
echo "4. Added laserWattage field processing in PATCH endpoint"
echo ""
echo "Backup created at: src/index.js.backup"