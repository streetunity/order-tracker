'use client';

import { DATE_PRESETS } from './historyHelpers';

export default function HistoryFilters({
  searchQuery,
  setSearchQuery,
  datePreset,
  setDatePreset,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
  totalCount
}) {
  return (
    <div className="filters-bar">
      {/* Search */}
      <div className="filter-search">
        <input
          type="text"
          placeholder="Search logs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="clear-search" onClick={() => setSearchQuery('')}>×</button>
        )}
      </div>

      {/* Date Preset */}
      <div className="filter-date">
        <select
          value={datePreset}
          onChange={(e) => setDatePreset(e.target.value)}
        >
          {DATE_PRESETS.map(preset => (
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          ))}
        </select>
      </div>

      {/* Custom Date Range */}
      {datePreset === 'custom' && (
        <div className="filter-custom-dates">
          <input
            type="date"
            value={customStartDate}
            onChange={(e) => setCustomStartDate(e.target.value)}
            placeholder="Start Date"
          />
          <span>to</span>
          <input
            type="date"
            value={customEndDate}
            onChange={(e) => setCustomEndDate(e.target.value)}
            placeholder="End Date"
          />
        </div>
      )}

      {/* Results Count */}
      <div className="filter-results">
        {totalCount} {totalCount === 1 ? 'result' : 'results'}
      </div>
    </div>
  );
}
