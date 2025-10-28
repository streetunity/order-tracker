// Discount Section Component
// Handles order discount input

export default function DiscountSection({ formData, setFormData }) {
  return (
    <div style={{
      backgroundColor: "#2d2d2d",
      border: "1px solid #404040",
      borderRadius: "8px",
      padding: "24px",
      marginTop: "16px"
    }}>
      <h2 style={{ fontSize: "18px", marginBottom: "20px", color: "#e4e4e4" }}>Discount</h2>
      
      <div style={{ maxWidth: "300px" }}>
        <label style={{
          display: "block",
          fontSize: "14px",
          fontWeight: "500",
          marginBottom: "8px",
          color: "#e4e4e4"
        }}>
          Discount Amount
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "18px", color: "#9ca3af" }}>$</span>
          <input
            type="text"
            className="input"
            value={formData.discount}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
                setFormData({ ...formData, discount: value });
              }
            }}
            placeholder="0.00"
            style={{ width: "150px", textAlign: "right" }}
          />
        </div>
        <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
          Discount will be subtracted from order total when calculating commissions
        </div>
      </div>
    </div>
  );
}
