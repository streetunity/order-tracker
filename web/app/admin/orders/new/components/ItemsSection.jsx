// Items Section Component
// Manages the list of items in the order

import ItemRow from './ItemRow';

export default function ItemsSection({
  items,
  setItems,
  manufacturers
}) {
  function addItem() {
    setItems([...items, { 
      name: "",
      qty: "",
      serialNumber: "",
      modelNumber: "",
      manufacturerId: "",
      voltage: "",
      power: "",
      notes: "",
      itemPrice: "",
      privateItemNote: "",
      hasExtendedShipping: false
    }]);
  }

  function removeItem(index) {
    if (items.length === 1) return; // Keep at least one item row
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index, field, value) {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  }

  return (
    <div style={{
      backgroundColor: "#2d2d2d",
      border: "1px solid #404040",
      borderRadius: "8px",
      padding: "24px",
      marginTop: "16px"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ fontSize: "18px", color: "#e4e4e4" }}>Order Items</h2>
        <button
          type="button"
          onClick={addItem}
          className="btn primary"
          style={{ padding: "8px 16px", fontSize: "14px" }}
        >
          + Add Another Item
        </button>
      </div>

      {items.map((item, index) => (
        <ItemRow
          key={index}
          item={item}
          index={index}
          updateItem={updateItem}
          removeItem={removeItem}
          canRemove={items.length > 1}
          manufacturers={manufacturers}
        />
      ))}
    </div>
  );
}
