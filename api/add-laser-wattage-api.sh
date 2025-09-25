#!/bin/bash

# This script adds laserWattage field support to the API
# Run this after applying the database migration

echo "Adding laserWattage field support to API..."

# The changes needed in api/src/index.js:

cat << 'EOF'
CHANGES NEEDED IN api/src/index.js:

1. In normalizeIncomingItems function (around line 97), add laserWattage:
   
   laserWattage: i?.laserWattage ? String(i.laserWattage).trim() : null,

2. In the public order endpoint (around line 727), include laserWattage in the items mapping:
   
   laserWattage: it.laserWattage,

3. In POST /orders/:orderId/items endpoint (around line 1844), add to data object:
   
   laserWattage: i.laserWattage,

4. In PATCH /orders/:orderId/items/:itemId endpoint (around line 1917), add:
   
   a) In the select statement at the beginning:
      laserWattage: true,
   
   b) Add the field processing (around line 2035, after voltage):
      
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

5. In the create order endpoint POST /orders (around line 1511), the normalizedItems 
   already includes laserWattage from step 1, so it will be saved automatically.

EOF

echo "Instructions printed. Please apply these changes manually to api/src/index.js"