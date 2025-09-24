// Fixed measurements endpoint converter
// This file shows the fix needed in /api/src/index.js

// The issue: Frontend sends strings like "100" but Prisma expects Float values
// The fix: Convert string values to numbers before saving

// In the measurements endpoint (around line 190-310 in index.js), update the data object:

const updatedItem = await prisma.$transaction(async (tx) => {
  const updated = await tx.orderItem.update({
    where: { id: itemId },
    data: {
      // Convert strings to numbers using parseFloat
      height: height !== undefined ? (height !== null ? parseFloat(height) : null) : item.height,
      width: width !== undefined ? (width !== null ? parseFloat(width) : null) : item.width,
      length: length !== undefined ? (length !== null ? parseFloat(length) : null) : item.length,
      weight: weight !== undefined ? (weight !== null ? parseFloat(weight) : null) : item.weight,
      measurementUnit: measurementUnit !== undefined ? measurementUnit : item.measurementUnit,
      weightUnit: weightUnit !== undefined ? weightUnit : item.weightUnit,
      measuredAt: new Date(),
      measuredBy: userName
    }
  });
  
  // Rest of the transaction...
});

// The parseFloat() function will convert string numbers to float numbers
// "100" becomes 100
// "100.5" becomes 100.5
// null remains null
// undefined uses the existing item value