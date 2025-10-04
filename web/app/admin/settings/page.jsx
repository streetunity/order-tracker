'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import './settings.css';

const STAGES = [
  'MANUFACTURING', 'TESTING', 'SHIPPING', 'AT_SEA', 
  'SMT', 'QC', 'DELIVERED', 'ONSITE', 'COMPLETED', 'FOLLOW_UP'
];

export default function SettingsPage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [thresholds, setThresholds] = useState([]);
  const [systemSettings, setSystemSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  
  // Local state for holiday settings
  const [localStartDate, setLocalStartDate] = useState('');
  const [localEndDate, setLocalEndDate] = useState('');
  const [localBufferDays, setLocalBufferDays] = useState('');
  const [hasUnsavedHolidayChanges, setHasUnsavedHolidayChanges] = useState(false);
  
  // Local state for stage thresholds
  const [localThresholds, setLocalThresholds] = useState([]);
  const [hasUnsavedThresholdChanges, setHasUnsavedThresholdChanges] = useState(false);
  
  // Confirmation dialog state
  const [showInitConfirm, setShowInitConfirm] = useState(false);
  const [showETAConfirm, setShowETAConfirm] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'ADMIN') {
      router.push('/admin/board');
      return;
    }
    loadSettings();
  }, [user, router]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [thresholdsRes, systemRes] = await Promise.all([
        fetch('/api/settings/thresholds', { headers: getAuthHeaders() }),
        fetch('/api/settings/system', { headers: getAuthHeaders() })
      ]);

      if (thresholdsRes.ok && systemRes.ok) {
        const thresholdsData = await thresholdsRes.json();
        const systemData = await systemRes.json();
        setThresholds(thresholdsData);
        setLocalThresholds(JSON.parse(JSON.stringify(thresholdsData))); // Deep copy
        setSystemSettings(systemData);
        
        // Initialize local state
        setLocalStartDate(systemData.HOLIDAY_SEASON_START?.value || '10-01');
        setLocalEndDate(systemData.HOLIDAY_SEASON_END?.value || '12-31');
        setLocalBufferDays(systemData.HOLIDAY_BUFFER_DAYS?.value || '25');
        setHasUnsavedHolidayChanges(false);
        setHasUnsavedThresholdChanges(false);
      }
    } catch (error) {
      console.error('Load settings error:', error);
      setMessage('Error loading settings');
    } finally {
      setLoading(false);
    }
  };

  const initializeThresholds = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/settings/thresholds/initialize', {
        method: 'POST',
        headers: getAuthHeaders()
      });

      if (res.ok) {
        setMessage('✓ Initialized default thresholds');
        await loadSettings();
        setShowInitConfirm(false);
      }
    } catch (error) {
      setMessage('Error initializing thresholds');
    } finally {
      setSaving(false);
    }
  };

  const recalculateETAs = async () => {
    try {
      setRecalculating(true);
      const res = await fetch('/api/settings/recalculate-etas', {
        method: 'POST',
        headers: getAuthHeaders()
      });

      if (res.ok) {
        const data = await res.json();
        setMessage(`✓ ${data.message}`);
        setShowETAConfirm(false);
        setTimeout(() => setMessage(''), 5000);
      } else {
        const error = await res.json();
        setMessage(`Error: ${error.error || 'Failed to recalculate ETAs'}`);
      }
    } catch (error) {
      console.error('Recalculate ETAs error:', error);
      setMessage('Error recalculating ETAs');
    } finally {
      setRecalculating(false);
    }
  };

  const saveThresholds = async () => {
    try {
      setSaving(true);
      
      // Save all modified thresholds
      const promises = localThresholds.map(threshold => 
        fetch(`/api/settings/thresholds/${threshold.stage}`, {
          method: 'PATCH',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            warningDays: parseInt(threshold.warningDays, 10),
            criticalDays: parseInt(threshold.criticalDays, 10)
          })
        })
      );

      const results = await Promise.all(promises);
      const allSuccess = results.every(r => r.ok);

      if (allSuccess) {
        const updates = await Promise.all(results.map(r => r.json()));
        setThresholds(updates);
        setLocalThresholds(JSON.parse(JSON.stringify(updates))); // Deep copy
        setMessage('✓ Stage thresholds saved successfully');
        setHasUnsavedThresholdChanges(false);
        setTimeout(() => setMessage(''), 3000);
      } else {
        const failedResult = results.find(r => !r.ok);
        const error = await failedResult.json();
        setMessage(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Save thresholds error:', error);
      setMessage('Error saving thresholds');
    } finally {
      setSaving(false);
    }
  };

  const saveHolidaySettings = async () => {
    try {
      setSaving(true);
      console.log('Saving holiday settings:', { localStartDate, localEndDate, localBufferDays });
      
      // Validate date format before sending
      const dateRegex = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
      if (!dateRegex.test(localStartDate)) {
        setMessage('Error: Start date must be in MM-DD format (e.g., 10-01)');
        setSaving(false);
        return;
      }
      if (!dateRegex.test(localEndDate)) {
        setMessage('Error: End date must be in MM-DD format (e.g., 12-31)');
        setSaving(false);
        return;
      }
      
      // Validate buffer days
      const bufferNum = parseInt(localBufferDays, 10);
      if (isNaN(bufferNum) || bufferNum < 0 || bufferNum > 100) {
        setMessage('Error: Buffer days must be between 0 and 100');
        setSaving(false);
        return;
      }
      
      // Save all three settings
      const promises = [
        fetch(`/api/settings/system/HOLIDAY_SEASON_START`, {
          method: 'PATCH',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: localStartDate })
        }),
        fetch(`/api/settings/system/HOLIDAY_SEASON_END`, {
          method: 'PATCH',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: localEndDate })
        }),
        fetch(`/api/settings/system/HOLIDAY_BUFFER_DAYS`, {
          method: 'PATCH',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: localBufferDays })
        })
      ];

      const results = await Promise.all(promises);
      
      // Check each result
      for (let i = 0; i < results.length; i++) {
        if (!results[i].ok) {
          const errorData = await results[i].json();
          console.error(`Failed to save setting ${i}:`, errorData);
          setMessage(`Error: ${errorData.error || 'Failed to save settings'}`);
          setSaving(false);
          return;
        }
      }

      // All successful
      const updates = await Promise.all(results.map(r => r.json()));
      console.log('All settings saved successfully:', updates);
      
      setSystemSettings(prev => ({
        ...prev,
        HOLIDAY_SEASON_START: { ...prev.HOLIDAY_SEASON_START, value: updates[0].value },
        HOLIDAY_SEASON_END: { ...prev.HOLIDAY_SEASON_END, value: updates[1].value },
        HOLIDAY_BUFFER_DAYS: { ...prev.HOLIDAY_BUFFER_DAYS, value: updates[2].value }
      }));
      setMessage('✓ Holiday settings saved successfully');
      setHasUnsavedHolidayChanges(false);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Save error:', error);
      setMessage(`Error saving holiday settings: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleHolidayChange = (setter) => (e) => {
    setter(e.target.value);
    setHasUnsavedHolidayChanges(true);
  };

  const handleThresholdChange = (stage, field, value) => {
    setLocalThresholds(prev => 
      prev.map(t => 
        t.stage === stage 
          ? { ...t, [field]: parseInt(value, 10) || 0 }
          : t
      )
    );
    setHasUnsavedThresholdChanges(true);
  };

  if (!user || user.role !== 'ADMIN') return null;

  return (
    <main className="settings-container">
      <div className="settings-header">
        <h1>Report Settings</h1>
        <button onClick={() => router.push('/admin/reports')} className="btn-back">
          ← Back to Reports
        </button>
      </div>

      {message && (
        <div className={`message ${message.startsWith('✓') ? 'success' : 'error'}`}>
          {message}
        </div>
      )}

      {loading ? (
        <div className="loading">Loading settings...</div>
      ) : (
        <>
          {/* System Settings Section */}
          <section className="settings-section">
            <h2>Holiday Season Configuration</h2>
            <p className="section-desc">
              During the holiday season (Oct 1 - Dec 31), the MANUFACTURING stage gets {systemSettings.HOLIDAY_BUFFER_DAYS?.value || '25'} extra days 
              added to its thresholds. Other stages remain unchanged but are naturally delayed by the extended manufacturing time.
            </p>

            <div className="settings-grid">
              <div className="setting-item">
                <label>Holiday Season Start (MM-DD)</label>
                <input
                  type="text"
                  value={localStartDate}
                  onChange={handleHolidayChange(setLocalStartDate)}
                  placeholder="10-01"
                  pattern="\d{2}-\d{2}"
                />
                <small>Format: MM-DD (e.g., 10-01 for October 1st)</small>
              </div>

              <div className="setting-item">
                <label>Holiday Season End (MM-DD)</label>
                <input
                  type="text"
                  value={localEndDate}
                  onChange={handleHolidayChange(setLocalEndDate)}
                  placeholder="12-31"
                  pattern="\d{2}-\d{2}"
                />
                <small>Format: MM-DD (e.g., 12-31 for December 31st)</small>
              </div>

              <div className="setting-item">
                <label>Holiday Buffer Days (Manufacturing Only)</label>
                <input
                  type="number"
                  value={localBufferDays}
                  onChange={handleHolidayChange(setLocalBufferDays)}
                  min="0"
                  max="100"
                />
                <small>Extra days for MANUFACTURING stage only (0-100)</small>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button 
                onClick={saveHolidaySettings} 
                disabled={saving || !hasUnsavedHolidayChanges}
                className="btn-init"
                style={{ opacity: (!hasUnsavedHolidayChanges || saving) ? 0.5 : 1 }}
              >
                {saving ? 'Saving...' : 'Save Holiday Settings'}
              </button>
              {hasUnsavedHolidayChanges && !saving && (
                <span style={{ color: 'var(--accent)', fontSize: '14px' }}>
                  ⚠ Unsaved changes
                </span>
              )}
            </div>
          </section>

          {/* Stage Thresholds Section */}
          <section className="settings-section">
            <div className="section-header">
              <h2>Stage Time Thresholds</h2>
              {localThresholds.length === 0 && (
                <button 
                  onClick={() => setShowInitConfirm(true)} 
                  disabled={saving} 
                  className="btn-init"
                >
                  Initialize Defaults
                </button>
              )}
            </div>

            <p className="section-desc">
              Set warning and critical thresholds for each manufacturing stage. Orders exceeding these 
              times will be flagged in OVaR and Chokepoints reports.
            </p>

            <div className="thresholds-table">
              <table>
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Warning Days</th>
                    <th>Critical Days</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {STAGES.map(stage => {
                    const threshold = localThresholds.find(t => t.stage === stage) || {
                      stage,
                      warningDays: 30,
                      criticalDays: 60,
                      description: `${stage} stage`
                    };

                    return (
                      <tr key={stage}>
                        <td className="stage-name">{stage.replace(/_/g, ' ')}</td>
                        <td>
                          <input
                            type="number"
                            value={threshold.warningDays}
                            onChange={(e) => handleThresholdChange(stage, 'warningDays', e.target.value)}
                            min="1"
                            max="365"
                            className="threshold-input"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={threshold.criticalDays}
                            onChange={(e) => handleThresholdChange(stage, 'criticalDays', e.target.value)}
                            min="1"
                            max="365"
                            className="threshold-input"
                          />
                        </td>
                        <td className="description">{threshold.description}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button 
                onClick={saveThresholds} 
                disabled={saving || !hasUnsavedThresholdChanges}
                className="btn-init"
                style={{ opacity: (!hasUnsavedThresholdChanges || saving) ? 0.5 : 1 }}
              >
                {saving ? 'Saving...' : 'Save Stage Thresholds'}
              </button>
              {hasUnsavedThresholdChanges && !saving && (
                <span style={{ color: 'var(--accent)', fontSize: '14px' }}>
                  ⚠ Unsaved changes
                </span>
              )}
            </div>
          </section>

          {/* ETA Recalculation Section */}
          <section className="settings-section">
            <h2>Customer ETA Management</h2>
            <p className="section-desc">
              Recalculate estimated delivery dates for all existing orders based on current threshold settings. 
              This will update the ETA shown on all customer tracking pages.
            </p>
            
            <div style={{ 
              padding: '1rem', 
              backgroundColor: 'rgba(255, 170, 0, 0.1)', 
              border: '1px solid rgba(255, 170, 0, 0.3)',
              borderRadius: '8px',
              marginBottom: '1rem'
            }}>
              <p style={{ margin: 0, color: 'var(--accent)' }}>
                ⚠️ <strong>Warning:</strong> This will overwrite ALL existing ETA dates on customer tracking pages. 
                Use this after changing threshold values to ensure all customers see updated delivery estimates.
              </p>
            </div>

            <button 
              onClick={() => setShowETAConfirm(true)} 
              disabled={recalculating}
              className="btn-init"
              style={{ 
                backgroundColor: 'var(--accent)',
                opacity: recalculating ? 0.5 : 1 
              }}
            >
              {recalculating ? 'Recalculating...' : 'Recalculate All ETAs'}
            </button>
          </section>

          <div className="help-section">
            <h3>💡 How Thresholds Work</h3>
            <ul>
              <li><strong>Warning</strong>: Items exceeding this time are flagged yellow (attention needed)</li>
              <li><strong>Critical</strong>: Items exceeding this time are flagged red (urgent action required)</li>
              <li><strong>Holiday Adjustment</strong>: Buffer days are ONLY added to MANUFACTURING stage (Oct-Dec). Other stages are automatically pushed back by the extended manufacturing time.</li>
              <li><strong>Saving Changes</strong>: Make your changes, then click the Save button to apply them</li>
              <li><strong>ETA Recalculation</strong>: After updating thresholds, use the "Recalculate All ETAs" button to update customer delivery estimates</li>
            </ul>
          </div>
        </>
      )}

      {/* Initialize Thresholds Confirmation Dialog */}
      {showInitConfirm && (
        <div className="confirm-overlay" onClick={() => setShowInitConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Initialize Default Thresholds?</h3>
            <p>This will load the default threshold values for all stages. Any existing custom values will be overwritten.</p>
            <p style={{ marginTop: '1rem', color: 'var(--text-dim)' }}>
              <strong>Note:</strong> You can modify these values after initialization.
            </p>
            <div className="confirm-actions">
              <button 
                onClick={() => setShowInitConfirm(false)} 
                className="btn-cancel"
              >
                Cancel
              </button>
              <button 
                onClick={initializeThresholds} 
                disabled={saving}
                className="btn-confirm"
              >
                {saving ? 'Initializing...' : 'Initialize Defaults'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ETA Recalculation Confirmation Dialog */}
      {showETAConfirm && (
        <div className="confirm-overlay" onClick={() => setShowETAConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ Recalculate All Customer ETAs?</h3>
            <p style={{ fontSize: '16px', marginBottom: '1rem' }}>
              This will recalculate and <strong>overwrite</strong> the estimated delivery dates for <strong>ALL existing orders</strong>.
            </p>
            <div style={{ 
              padding: '1rem', 
              backgroundColor: 'rgba(255, 170, 0, 0.1)', 
              border: '1px solid rgba(255, 170, 0, 0.3)',
              borderRadius: '6px',
              marginBottom: '1rem'
            }}>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '14px' }}>
                <strong>What will happen:</strong>
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '14px' }}>
                <li>All customer tracking pages will show updated ETA dates</li>
                <li>ETAs will be calculated based on your current threshold settings</li>
                <li>This process cannot be undone</li>
              </ul>
            </div>
            <p style={{ marginTop: '1rem', color: 'var(--text-dim)', fontSize: '14px' }}>
              <strong>When to use this:</strong> After updating stage thresholds or holiday settings to ensure all customer estimates are accurate.
            </p>
            <div className="confirm-actions">
              <button 
                onClick={() => setShowETAConfirm(false)} 
                className="btn-cancel"
              >
                Cancel
              </button>
              <button 
                onClick={recalculateETAs} 
                disabled={recalculating}
                className="btn-confirm"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {recalculating ? 'Recalculating...' : 'Yes, Recalculate All ETAs'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
