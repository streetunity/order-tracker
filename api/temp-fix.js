// Temporary fix - add this at line 305 in src/index.js
// Convert string values to numbers for measurements
const parseNum = (val) => val === null || val === undefined || val === '' ? null : parseFloat(val);

// Then replace lines 306-309 with:
// height: height !== undefined ? parseNum(height) : item.height,
// width: width !== undefined ? parseNum(width) : item.width,
// length: length !== undefined ? parseNum(length) : item.length,
// weight: weight !== undefined ? parseNum(weight) : item.weight,
