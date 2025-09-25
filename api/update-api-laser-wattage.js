const fs = require('fs');
const path = require('path');

// Read the current index.js file
const indexPath = path.join(__dirname, 'src', 'index.js');
let content = fs.readFileSync(indexPath, 'utf8');

console.log('Adding laserWattage field support to API...');

// 1. Update normalizeIncomingItems function
const normalizeItemsRegex = /voltage: i\?\.voltage \? String\(i\.voltage\)\.trim\(\) : null,/g;
const normalizeItemsReplacement = `voltage: i?.voltage ? String(i.voltage).trim() : null,
      laserWattage: i?.laserWattage ? String(i.laserWattage).trim() : null,`;

content = content.replace(normalizeItemsRegex, normalizeItemsReplacement);
console.log('✓ Updated normalizeIncomingItems function');

// 2. Update public order endpoint
const publicOrderRegex = /voltage: it\.voltage,/g;
const publicOrderReplacement = `voltage: it.voltage,
        laserWattage: it.laserWattage,`;

content = content.replace(publicOrderRegex, publicOrderReplacement);
console.log('✓ Updated public order endpoint');

// 3. Update PATCH endpoint select statement
const patchSelectRegex = /voltage: true,\n        notes: true,/g;
const patchSelectReplacement = `voltage: true,
        laserWattage: true,
        notes: true,`;

content = content.replace(patchSelectRegex, patchSelectReplacement);
console.log('✓ Updated PATCH endpoint select statement');

// 4. Add laserWattage field processing in PATCH endpoint
// Find the voltage processing block and add laserWattage after it
const voltageProcessingRegex = /(if \(req\.body\.hasOwnProperty\('voltage'\)\) \{[\s\S]*?\}\n    \})/;
const voltageProcessingMatch = content.match(voltageProcessingRegex);

if (voltageProcessingMatch) {
  const laserWattageProcessing = `
    
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
    }`;
  
  const replacement = voltageProcessingMatch[0] + laserWattageProcessing;
  content = content.replace(voltageProcessingRegex, replacement);
  console.log('✓ Added laserWattage field processing in PATCH endpoint');
}

// Write the updated content back
fs.writeFileSync(indexPath, content);
console.log('\n✅ Successfully updated api/src/index.js with laserWattage support!');
console.log('\nNext steps:');
console.log('1. Run the database migration: cd api && npx prisma migrate deploy');
console.log('2. Restart the API server: pm2 restart order-tracker-backend');