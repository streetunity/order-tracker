# Edit Order Page - Required Changes

## 1. Update the saveItem function signature (around line 259)

Find:
```javascript
async function saveItem(itemId, productCode, qty, serialNumber, modelNumber, voltage, laserWattage, notes)
```

Replace with:
```javascript
async function saveItem(itemId, productCode, qty, serialNumber, modelNumber, voltage, laserWattage, notes, itemPrice, privateItemNote)
```

## 2. Update the saveItem body (around line 267-276)

Find:
```javascript
body: JSON.stringify({ 
  productCode, 
  qty, 
  serialNumber, 
  modelNumber, 
  voltage, 
  laserWattage: laserWattage || null,
  notes 
})
```

Replace with:
```javascript
body: JSON.stringify({ 
  productCode, 
  qty, 
  serialNumber, 
  modelNumber, 
  voltage, 
  laserWattage: laserWattage || null,
  notes,
  itemPrice: itemPrice || null,
  privateItemNote: privateItemNote || null
})
```

## 3. Update the EditableRow onSave prop (around line 510-511)

Find:
```javascript
onSave={(name, qty, serial, model, voltage, laserWattage, notes) => 
  saveItem(it.id, name, qty, serial, model, voltage, laserWattage, notes)}
```

Replace with:
```javascript
onSave={(name, qty, serial, model, voltage, laserWattage, notes, itemPrice, privateItemNote) => 
  saveItem(it.id, name, qty, serial, model, voltage, laserWattage, notes, itemPrice, privateItemNote)}
```

## 4. Replace the entire EditableRow function

Find the function `function EditableRow` at the bottom of the file and replace it entirely with the contents from `web/EditableRow-update.jsx`