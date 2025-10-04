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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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
        setSystemSettings(systemData);
        
        // Initialize local state
        setLocalStartDate(systemData.HOLIDAY_SEASON_START?.value || '10-01');
        setLocalEndDate(systemData.HOLIDAY_SEASON_END?.value || '12-31');
        setLocalBufferDays(systemData.HOLIDAY_BUFFER_DAYS?.value || '25');
        setHasUnsavedChanges(false);
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
      }
    } catch (error) {
      setMessage('Error initializing thresholds');
    } finally {
      setSaving(false);
    }
  };

  const updateThreshold = async (stage, field, value) => {
    try {
      const res = await fetch(`/api/settings/thresholds/${stage}`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: parseInt(value, 10) })
      });

      if (res.ok) {
        const updated = await res.json();
        setThresholds(prev => 
          prev.map(t => t.stage === stage ? updated : t)
        );
        setMessage(`✓ Updated ${stage} ${field}`);
        setTimeout(() => setMessage(''), 3000);
      } else {
        const error = await res.json();
        setMessage(`Error: ${error.error}`);
      }
    } catch (error) {
      setMessage('Error updating threshold');
    }
  };

  const saveHolidaySettings = async () => {
    try {
      setSaving(true);
      
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
      const allSuccess = results.every(r => r.ok);

      if (allSuccess) {
        // Update system settings state
        const updates = await Promise.all(results.map(r => r.json()));
        setSystemSettings(prev => ({
          ...prev,
          HOLIDAY_SEASON_START: { ...prev.HOLIDAY_SEASON_START, value: updates[0].value },
          HOLIDAY_SEASON_END: { ...prev.HOLIDAY_SEASON_END, value: updates[1].value },
          HOLIDAY_BUFFER_DAYS: { ...prev.HOLIDAY_BUFFER_DAYS, value: updates[2].value }
        }));
        setMessage('✓ Holiday settings saved successfully');
        setHasUnsavedChanges(false);
        setTimeout(() => setMessage(''), 3000);
      } else {
        // Get error from first failed request
        const failedResult = results.find(r => !r.ok);
        const error = await failedResult.json();
        setMessage(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Save error:', error);
      setMessage('Error saving holiday settings');
    } finally {
      setSaving(false);
    }
  };

  const handleHolidayChange = (setter) => (e) => {
    setter(e.target.value);
    setHasUnsavedChanges(true);
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
                <small>Default: October 1st</small>
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
                <small>Default: December 31st</small>
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
                <small>Extra days for MANUFACTURING stage only</small>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button 
                onClick={saveHolidaySettings} 
                disabled={saving || !hasUnsavedChanges}
                className="btn-init"
                style={{ opacity: (!hasUnsavedChanges || saving) ? 0.5 : 1 }}
              >
                {saving ? 'Saving...' : 'Save Holiday Settings'}
              </button>
              {hasUnsavedChanges && !saving && (
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
              {thresholds.length === 0 && (
                <button onClick={initializeThresholds} disabled={saving} className="btn-init">
                  {saving ? 'Initializing...' : 'Initialize Defaults'}
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
                    const threshold = thresholds.find(t => t.stage === stage) || {
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
                            onChange={(e) => updateThreshold(stage, 'warningDays', e.target.value)}
                            min="1"
                            max="365"
                            className="threshold-input"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={threshold.criticalDays}
                            onChange={(e) => updateThreshold(stage, 'criticalDays', e.target.value)}
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
          </section>

          <div className="help-section">
            <h3>💡 How Thresholds Work</h3>
            <ul>
              <li><strong>Warning</strong>: Items exceeding this time are flagged yellow (attention needed)</li>
              <li><strong>Critical</strong>: Items exceeding this time are flagged red (urgent action required)</li>
              <li><strong>Holiday Adjustment</strong>: Buffer days are ONLY added to MANUFACTURING stage (Oct-Dec). Other stages are automatically pushed back by the extended manufacturing time.</li>
              <li><strong>Stage Thresholds</strong>: Changes to stage thresholds save immediately when you modify them</li>
            </ul>
          </div>
        </>
      )}
    </main>
  );
}
