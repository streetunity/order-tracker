const fs = require('fs');
const path = require('path');

// Read the edit order page
const editOrderPath = path.join(__dirname, 'app', 'admin', 'orders', '[id]', 'page.jsx');
let content = fs.readFileSync(editOrderPath, 'utf8');

console.log('Adding laserWattage field to Edit Order page...');

// 1. Add laserWattage to the newItem state initialization
const newItemStateRegex = /const \[newItem, setNewItem\] = useState\(\{ productCode: "", qty: 1, serialNumber: "", modelNumber: "", voltage: "", notes: "" \}\);/g;
const newItemStateReplacement = 'const [newItem, setNewItem] = useState({ productCode: "", qty: 1, serialNumber: "", modelNumber: "", voltage: "", laserWattage: "", notes: "" });';

content = content.replace(newItemStateRegex, newItemStateReplacement);
console.log('✓ Updated newItem state initialization');

// 2. Add laserWattage to saveItem function call
const saveItemCallRegex = /saveItem\(it\.id, name, qty, serial, model, voltage, notes\)/g;
const saveItemCallReplacement = 'saveItem(it.id, name, qty, serial, model, voltage, laserWattage, notes)';

content = content.replace(saveItemCallRegex, saveItemCallReplacement);

// 3. Update the saveItem function signature
const saveItemFuncRegex = /async function saveItem\(itemId, productCode, qty, serialNumber, modelNumber, voltage, notes\) \{/g;
const saveItemFuncReplacement = 'async function saveItem(itemId, productCode, qty, serialNumber, modelNumber, voltage, laserWattage, notes) {';

content = content.replace(saveItemFuncRegex, saveItemFuncReplacement);

// 4. Update the saveItem body JSON
const saveItemBodyRegex = /body: JSON\.stringify\(\{ productCode, qty, serialNumber, modelNumber, voltage, notes \}\),/g;
const saveItemBodyReplacement = 'body: JSON.stringify({ productCode, qty, serialNumber, modelNumber, voltage, laserWattage, notes }),';

content = content.replace(saveItemBodyRegex, saveItemBodyReplacement);
console.log('✓ Updated saveItem function');

// 5. Update addItem function to include laserWattage
const addItemVarsRegex = /const voltage = newItem\.voltage\.trim\(\);\n    const notes = newItem\.notes\.trim\(\);/g;
const addItemVarsReplacement = `const voltage = newItem.voltage.trim();
    const laserWattage = newItem.laserWattage.trim();
    const notes = newItem.notes.trim();`;

content = content.replace(addItemVarsRegex, addItemVarsReplacement);

const addItemBodyRegex = /body: JSON\.stringify\(\{ productCode, qty, serialNumber, modelNumber, voltage, notes \}\),/g;
const addItemBodyReplacement = 'body: JSON.stringify({ productCode, qty, serialNumber, modelNumber, voltage, laserWattage, notes }),';

content = content.replace(addItemBodyRegex, addItemBodyReplacement);

// 6. Reset newItem to include laserWattage
const resetNewItemRegex = /setNewItem\(\{ productCode: "", qty: 1, serialNumber: "", modelNumber: "", voltage: "", notes: "" \}\);/g;
const resetNewItemReplacement = 'setNewItem({ productCode: "", qty: 1, serialNumber: "", modelNumber: "", voltage: "", laserWattage: "", notes: "" });';

content = content.replace(resetNewItemRegex, resetNewItemReplacement);
console.log('✓ Updated addItem function');

// 7. Add laserWattage header to the table
const tableHeaderRegex = /<th style=\{\{ width: "80px" \}\}>Voltage<\/th>/g;
const tableHeaderReplacement = `<th style={{ width: "80px" }}>Voltage</th>
                    <th style={{ width: "100px" }}>Laser Wattage</th>`;

content = content.replace(tableHeaderRegex, tableHeaderReplacement);
console.log('✓ Added table header');

// 8. Update colspan for empty row
const colspanRegex = /colSpan=\{7\}/g;
const colspanReplacement = 'colSpan={8}';

content = content.replace(colspanRegex, colspanReplacement);

// 9. Add laserWattage input field in the Add New Item form
const voltageInputRegex = /(<div>\s*<label[^>]*>Voltage<\/label>\s*<input[\s\S]*?style=\{\{ width: "100px" \}\}\s*\/>\s*<\/div>)/g;
const voltageInputMatch = content.match(voltageInputRegex);

if (voltageInputMatch) {
  const laserWattageInput = `
                  <div>
                    <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "#6b7280" }}>Laser Wattage</label>
                    <input
                      className="input"
                      placeholder="Optional"
                      value={newItem.laserWattage}
                      onChange={e => setNewItem(v => ({ ...v, laserWattage: e.target.value }))}
                      style={{ width: "120px" }}
                    />
                  </div>`;
  
  const replacement = voltageInputMatch[0] + laserWattageInput;
  content = content.replace(voltageInputRegex, replacement);
  console.log('✓ Added input field to Add New Item form');
}

// 10. Update EditableRow component
const editableRowPropsRegex = /function EditableRow\(\{ item, onSave, onDelete, disabled, isLocked \}\) \{/g;
const editableRowPropsMatch = content.match(editableRowPropsRegex);

if (editableRowPropsMatch) {
  // Add laserWattage state
  const voltageStateRegex = /const \[voltage, setVoltage\] = useState\(item\.voltage \|\| ""\);/g;
  const voltageStateReplacement = `const [voltage, setVoltage] = useState(item.voltage || "");
  const [laserWattage, setLaserWattage] = useState(item.laserWattage || "");`;
  
  content = content.replace(voltageStateRegex, voltageStateReplacement);
  
  // Update changed comparison
  const changedRegex = /voltage\.trim\(\) !== \(item\.voltage \|\| ""\) \|\|/g;
  const changedReplacement = `voltage.trim() !== (item.voltage || "") ||
                  laserWattage.trim() !== (item.laserWattage || "") ||`;
  
  content = content.replace(changedRegex, changedReplacement);
  
  // Update onSave call in EditableRow
  const onSaveCallRegex = /onClick=\{\(\) => onSave\(name\.trim\(\), Number\(qty \|\| 1\), serialNumber\.trim\(\), modelNumber\.trim\(\), voltage\.trim\(\), notes\.trim\(\)\)\}/g;
  const onSaveCallReplacement = 'onClick={() => onSave(name.trim(), Number(qty || 1), serialNumber.trim(), modelNumber.trim(), voltage.trim(), laserWattage.trim(), notes.trim())}';
  
  content = content.replace(onSaveCallRegex, onSaveCallReplacement);
  
  // Add laserWattage input cell in EditableRow
  const voltageInputCellRegex = /(<td>\s*<input[\s\S]*?value=\{voltage\}[\s\S]*?<\/td>)/g;
  const voltageInputCellMatch = content.match(voltageInputCellRegex);
  
  if (voltageInputCellMatch) {
    const laserWattageCell = `
      <td>
        <input 
          className="input" 
          value={laserWattage} 
          onChange={e => setLaserWattage(e.target.value)} 
          placeholder="Optional"
          disabled={isLocked}
          style={{ width: "100px", opacity: isLocked ? 0.6 : 1 }}
        />
      </td>`;
    
    const replacement = voltageInputCellMatch[0] + laserWattageCell;
    content = content.replace(voltageInputCellRegex, replacement);
  }
  
  console.log('✓ Updated EditableRow component');
}

// Write the updated content back
fs.writeFileSync(editOrderPath, content);
console.log('\n✅ Successfully updated Edit Order page with laserWattage field!');
console.log('\nThe laserWattage field has been added to:');
console.log('- Item table header');
console.log('- Add New Item form');
console.log('- EditableRow component');
console.log('- Save and add item functions');