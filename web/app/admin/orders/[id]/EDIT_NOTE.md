# Edit Order Page - Price Field Update

The price field on the edit order page needs to be moved outside the admin-only section.

In the EditableRow component (at the bottom of page.jsx), the price and private notes fields are currently both wrapped in:
```javascript
{isAdmin && (
  <>
    // private notes input
    // price input  
  </>
)}
```

They need to be separated so price is visible to all users:

```javascript
// Price field - visible to all users
<div style={{ width: "120px" }}>
  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
    <span style={{ fontSize: "14px", color: "#9ca3af" }}>$</span>
    <input
      className="input"
      type="text"
      value={itemPrice}
      onChange={handlePriceChange}
      placeholder="0.00"
      style={{ 
        width: "90px", 
        textAlign: "right"
      }}
    />
  </div>
</div>

{isAdmin && (
  // Private notes - admin only
  <div style={{ flex: 1, minWidth: "200px" }}>
    <input
      className="input"
      value={privateItemNote}
      onChange={e => onFieldChange('privateItemNote', e.target.value)}
      placeholder="Purchasing notes (private, admin only)"
      style={{ 
        width: "100%"
      }}
    />
  </div>
)}
```

Also update the lock message to say "Price, extended shipping and admin fields" instead of "Admin fields (price/purchasing notes)"