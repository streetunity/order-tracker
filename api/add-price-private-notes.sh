#!/bin/bash

# Script to add itemPrice and privateItemNote fields to the API

echo "Adding itemPrice and privateItemNote support to API..."

# Create a backup
cp src/index.js src/index.js.backup-$(date +%Y%m%d-%H%M%S)

# Create patch file for the changes
cat << 'EOF' > add-price-private-notes.patch
--- a/src/index.js
+++ b/src/index.js
@@ -1,1 +1,1 @@
 // PATCH /api/orders/:id/items/:itemId - Update an order item
 app.patch("/api/orders/:orderId/items/:itemId", requireAuth, async (req, res) => {
   try {
     const { orderId, itemId } = req.params;
-    const { productCode, qty, serialNumber, modelNumber, voltage, laserWattage, notes } = req.body;
+    const { productCode, qty, serialNumber, modelNumber, voltage, laserWattage, notes, itemPrice, privateItemNote } = req.body;
     
     // Get the order with its lock status
     const order = await prisma.order.findUnique({
       where: { id: orderId },
       select: { isLocked: true }
     });
     
     if (!order) {
       return res.status(404).json({ error: "Order not found" });
     }
     
-    // If order is locked, prevent editing of most fields
-    if (order.isLocked) {
+    // If order is locked, prevent editing of most fields (except price and private notes for admins)
+    if (order.isLocked && (!req.user || req.user.role !== 'ADMIN')) {
       return res.status(403).json({ error: "Order is locked. Item details cannot be edited." });
     }
+    
+    // Build update data based on what's allowed
+    const updateData = {};
+    
+    // These fields can only be updated if order is not locked
+    if (!order.isLocked) {
+      if (productCode !== undefined) updateData.productCode = productCode;
+      if (qty !== undefined) updateData.qty = qty;
+      if (serialNumber !== undefined) updateData.serialNumber = serialNumber;
+      if (modelNumber !== undefined) updateData.modelNumber = modelNumber;
+      if (voltage !== undefined) updateData.voltage = voltage;
+      if (laserWattage !== undefined) updateData.laserWattage = laserWattage;
+      if (notes !== undefined) updateData.notes = notes;
+    }
+    
+    // Admin-only fields that can be updated even when locked
+    if (req.user && req.user.role === 'ADMIN') {
+      if (itemPrice !== undefined) updateData.itemPrice = itemPrice === "" || itemPrice === null ? null : parseFloat(itemPrice);
+      if (privateItemNote !== undefined) updateData.privateItemNote = privateItemNote || null;
+    }
 
     const item = await prisma.orderItem.update({
       where: { id: itemId },
-      data: {
-        productCode,
-        qty,
-        serialNumber: serialNumber || null,
-        modelNumber: modelNumber || null,
-        voltage: voltage || null,
-        laserWattage: laserWattage || null,
-        notes: notes || null
-      }
+      data: updateData
     });
     
     res.json(item);
   } catch (error) {
     console.error("Error updating item:", error);
     res.status(500).json({ error: "Failed to update item" });
   }
 });
EOF

echo "Patch created. Now let's find and update the correct section..."

# Apply the changes using a more robust approach
node -e "
const fs = require('fs');
let content = fs.readFileSync('src/index.js', 'utf8');

// Find and update the PATCH endpoint for items
const patchPattern = /app\.patch\([\"']\/api\/orders\/:orderId\/items\/:itemId[\"']/;
const patchMatch = content.match(patchPattern);

if (patchMatch) {
  console.log('Found PATCH endpoint for items, updating...');
  
  // Find the complete endpoint (from app.patch to the closing });)
  const startIndex = content.indexOf(patchMatch[0]);
  let endIndex = startIndex;
  let braceCount = 0;
  let inFunction = false;
  
  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === '{') {
      braceCount++;
      inFunction = true;
    } else if (content[i] === '}') {
      braceCount--;
      if (inFunction && braceCount === 0) {
        // Found the closing brace, now find the );
        for (let j = i; j < content.length; j++) {
          if (content.substring(j, j + 2) === ');') {
            endIndex = j + 2;
            break;
          }
        }
        break;
      }
    }
  }
  
  // Replace the endpoint
  const newEndpoint = \`app.patch(\"/api/orders/:orderId/items/:itemId\", requireAuth, async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { productCode, qty, serialNumber, modelNumber, voltage, laserWattage, notes, itemPrice, privateItemNote } = req.body;
    
    // Get the order with its lock status
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { isLocked: true }
    });
    
    if (!order) {
      return res.status(404).json({ error: \"Order not found\" });
    }
    
    // Build update data based on what's allowed
    const updateData = {};
    
    // These fields can only be updated if order is not locked
    if (!order.isLocked) {
      if (productCode !== undefined) updateData.productCode = productCode;
      if (qty !== undefined) updateData.qty = qty;
      if (serialNumber !== undefined) updateData.serialNumber = serialNumber;
      if (modelNumber !== undefined) updateData.modelNumber = modelNumber;
      if (voltage !== undefined) updateData.voltage = voltage;
      if (laserWattage !== undefined) updateData.laserWattage = laserWattage;
      if (notes !== undefined) updateData.notes = notes;
    }
    
    // Admin-only fields that can be updated even when locked
    if (req.user && req.user.role === 'ADMIN') {
      if (itemPrice !== undefined) updateData.itemPrice = itemPrice === \"\" || itemPrice === null ? null : parseFloat(itemPrice);
      if (privateItemNote !== undefined) updateData.privateItemNote = privateItemNote || null;
    }

    const item = await prisma.orderItem.update({
      where: { id: itemId },
      data: updateData
    });
    
    res.json(item);
  } catch (error) {
    console.error(\"Error updating item:\", error);
    res.status(500).json({ error: \"Failed to update item\" });
  }
});\`;
  
  content = content.substring(0, startIndex) + newEndpoint + content.substring(endIndex);
  
  fs.writeFileSync('src/index.js', content);
  console.log('Successfully updated PATCH endpoint for items');
} else {
  console.log('Could not find PATCH endpoint for items');
}

// Also update the GET endpoint to include these fields when returning orders
const getPattern = /app\.get\([\"']\/api\/orders\/:id[\"']/;
const getMatch = content.match(getPattern);

if (getMatch) {
  console.log('Updating GET endpoint to include new fields...');
  // The fields are already in the database, Prisma will return them automatically
  console.log('GET endpoint will automatically include new fields from database');
}

// Update the endpoint that calculates yearly totals (we'll add this as a new endpoint)
const yearlyTotalEndpoint = \`
// GET /api/orders/yearly-total - Get total of all item prices for current year (ADMIN ONLY)
app.get(\"/api/orders/yearly-total\", requireAuth, requireAdmin, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);
    
    const result = await prisma.orderItem.aggregate({
      _sum: {
        itemPrice: true
      },
      where: {
        order: {
          createdAt: {
            gte: startOfYear,
            lte: endOfYear
          }
        }
      }
    });
    
    const total = result._sum.itemPrice || 0;
    
    res.json({ 
      total: total,
      year: currentYear,
      formatted: new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD' 
      }).format(total)
    });
  } catch (error) {
    console.error(\"Error calculating yearly total:\", error);
    res.status(500).json({ error: \"Failed to calculate yearly total\" });
  }
});\`;

// Add the yearly total endpoint before the general orders endpoint
const ordersEndpointPattern = /app\.get\([\"']\/api\/orders[\"']\s*,/;
const ordersMatch = content.match(ordersEndpointPattern);

if (ordersMatch) {
  const insertIndex = content.indexOf(ordersMatch[0]);
  content = content.substring(0, insertIndex) + yearlyTotalEndpoint + '\n\n' + content.substring(insertIndex);
  fs.writeFileSync('src/index.js', content);
  console.log('Added yearly total endpoint');
}
"

echo "API updates complete!"
echo "The API now supports:"
echo "  - itemPrice field (admin only, editable even when locked)"
echo "  - privateItemNote field (admin only, editable even when locked)"
echo "  - GET /api/orders/yearly-total endpoint for yearly totals"