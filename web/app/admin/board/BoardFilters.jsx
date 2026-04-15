"use client";

const STAGES = [
  "PENDING_FUNDING",
  "MANUFACTURING",
  "TESTING",
  "SHIPPING",
  "AT_SEA",
  "SMT",
  "QC",
  "DELIVERED",
  "ONSITE",
  "COMPLETED",
  "FOLLOW_UP",
];

const STAGE_LABELS = {
  PENDING_FUNDING: "Pending Funding",
  MANUFACTURING: "Manufacturing",
  TESTING: "Debugging & Testing",
  SHIPPING: "Preparing Container",
  AT_SEA: "Container At Sea",
  SMT: "Arrived At SMT",
  QC: "Quality Control",
  DELIVERED: "Delivered To Customer",
  ONSITE: "On Site Setup & Training",
  COMPLETED: "Training Complete",
  FOLLOW_UP: "Follow Up",
};

export default function BoardFilters({
  search,
  setSearch,
  stageFilter,
  setStageFilter,
  salesRepFilter,
  setSalesRepFilter,
  salesReps,
  onApply,
  loading,
  err,
  hasResults
}) {
  return (
    <div className="toolbar">
      <div className="tool">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onApply(); }}
          placeholder="Search Sales Person / Account / Contact / Item / Serial # / Manufacturer"
          style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, minWidth: "350px" }}
        />
        <button className="btn" onClick={onApply}>Apply</button>
      </div>
      <div className="tool">
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6 }}
        >
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>{STAGE_LABELS[s] ?? s.replace(/_/g, " ")}</option>
          ))}
        </select>
        {stageFilter && (
          <button className="btn" onClick={() => setStageFilter("")} style={{ marginLeft: "4px" }}>Clear</button>
        )}
      </div>
      <div className="tool">
        <select
          value={salesRepFilter}
          onChange={(e) => setSalesRepFilter(e.target.value)}
          style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6 }}
        >
          <option value="">All Sales Reps</option>
          {salesReps.map((rep) => (
            <option key={rep} value={rep}>{rep}</option>
          ))}
        </select>
        {salesRepFilter && (
          <button className="btn" onClick={() => setSalesRepFilter("")} style={{ marginLeft: "4px" }}>Clear</button>
        )}
      </div>
      {!!err && <div className="errorBox">Failed to load: {err}</div>}
      {loading && <div className="loading">Loading…</div>}
      {!loading && (stageFilter || salesRepFilter) && !hasResults && (
        <div style={{ padding: "8px 12px", backgroundColor: "#fef3c7", border: "1px solid #f59e0b", borderRadius: "6px", color: "#92400e" }}>
          No items found with current filters.
          <button onClick={() => { setStageFilter(""); setSalesRepFilter(""); }} style={{ marginLeft: "8px", textDecoration: "underline", background: "none", border: "none", color: "#92400e", cursor: "pointer" }}>Clear all filters</button>
        </div>
      )}
    </div>
  );
}

export { STAGES, STAGE_LABELS };
