// API service layer for Settings page
// Handles all API calls related to settings, thresholds, and ETA management

export const settingsApi = {
  // Load stage thresholds
  async loadThresholds(getAuthHeaders) {
    const res = await fetch('/api/settings/thresholds', { 
      headers: getAuthHeaders() 
    });
    if (!res.ok) throw new Error('Failed to load thresholds');
    return res.json();
  },

  // Load system settings
  async loadSystemSettings(getAuthHeaders) {
    const res = await fetch('/api/settings/system', { 
      headers: getAuthHeaders() 
    });
    if (!res.ok) throw new Error('Failed to load system settings');
    return res.json();
  },

  // Initialize default thresholds
  async initializeThresholds(getAuthHeaders) {
    const res = await fetch('/api/settings/thresholds/initialize', {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to initialize thresholds');
    return res.json();
  },

  // Save individual threshold
  async saveThreshold(stage, warningDays, criticalDays, getAuthHeaders) {
    const res = await fetch(`/api/settings/thresholds/${stage}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        warningDays: parseInt(warningDays, 10),
        criticalDays: parseInt(criticalDays, 10)
      })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to save threshold');
    }
    return res.json();
  },

  // Save all thresholds
  async saveAllThresholds(thresholds, getAuthHeaders) {
    const promises = thresholds.map(threshold => 
      this.saveThreshold(
        threshold.stage, 
        threshold.warningDays, 
        threshold.criticalDays, 
        getAuthHeaders
      )
    );
    
    const results = await Promise.all(promises);
    return results;
  },

  // Save system setting
  async saveSystemSetting(key, value, getAuthHeaders) {
    const res = await fetch(`/api/settings/system/${key}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || `Failed to save ${key}`);
    }
    return res.json();
  },

  // Save special settings (holiday and extended shipping)
  async saveSpecialSettings(settings, getAuthHeaders) {
    const promises = [
      this.saveSystemSetting('HOLIDAY_SEASON_START', settings.startDate, getAuthHeaders),
      this.saveSystemSetting('HOLIDAY_SEASON_END', settings.endDate, getAuthHeaders),
      this.saveSystemSetting('HOLIDAY_BUFFER_DAYS', settings.bufferDays, getAuthHeaders),
      this.saveSystemSetting('EXTENDED_SHIPPING_DAYS', settings.extendedDays, getAuthHeaders)
    ];

    const results = await Promise.all(promises);
    return results;
  },

  // Recalculate all ETAs
  async recalculateETAs(getAuthHeaders) {
    const res = await fetch('/api/settings/recalculate-etas', {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to recalculate ETAs');
    }
    return res.json();
  }
};
