"use client";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "FILED", label: "Filed" },
  { value: "CLEARED", label: "Cleared" },
  { value: "ISSUES", label: "Issues" }
];

export default function ShipmentFilters({
  searchQuery,
  setSearchQuery,
  viewFilter,
  setViewFilter,
  statusFilter,
  setStatusFilter,
  error,
  setError
}) {
  const filterButtonStyle = (active) => ({
    padding: "8px 16px",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    background: active ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.03)",
    color: active ? "#fff" : "rgba(255, 255, 255, 0.6)",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: active ? "600" : "400"
  });

  return (
    <>
      {/* Error Message */}
      {error && (
        <div style={{
          padding: "12px 16px",
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "8px",
          color: "#ef4444",
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>{error}</span>
          <button
            onClick={() => setError("")}
            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{
        display: "flex",
        gap: 16,
        marginBottom: 24,
        flexWrap: "wrap",
        alignItems: "center"
      }}>
        <input
          type="text"
          placeholder="Search shipment, contact, customer, PO, item..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            padding: "10px 16px",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "8px",
            color: "#fff",
            width: "360px",
            fontSize: "14px"
          }}
        />

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setViewFilter("active")}
            style={filterButtonStyle(viewFilter === "active")}
          >
            Active
          </button>
          <button
            onClick={() => setViewFilter("archived")}
            style={filterButtonStyle(viewFilter === "archived")}
          >
            Archived
          </button>
          <button
            onClick={() => setViewFilter("all")}
            style={filterButtonStyle(viewFilter === "all")}
          >
            All
          </button>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: "10px 16px",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "8px",
            color: "#fff",
            fontSize: "14px"
          }}
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </>
  );
}
