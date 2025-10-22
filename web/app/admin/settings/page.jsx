'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import './settings.css';

const STAGES = [
  'MANUFACTURING', 'TESTING', 'SHIPPING', 'AT_SEA', 
  'SMT', 'QC', 'DELIVERED', 'ONSITE', 'COMPLETED', 'FOLLOW_UP'
];

// Stages included in ETA calculation
const ETA_STAGES = [
  'MANUFACTURING', 'TESTING', 'SHIPPING', 'AT_SEA', 
  'SMT', 'QC', 'DELIVERED'
];

export default function SettingsPage() {
  const { user, getAuthHeaders, isAdminOrHigher } = useAuth();
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
  const [localExtendedDays, setLocalExtendedDays] = useState(''); // NEW: Extended shipping days
  const [hasUnsavedHolidayChanges, setHasUnsavedHolidayChanges] = useState(false);
  
  // Local state for stage thresholds
  const [localThresholds, setLocalThresholds] = useState([]);
  const [hasUnsavedThresholdChanges, setHasUnsavedThresholdChanges] = useState(false);
  
  // Confirmation dialog state
  const [showInitConfirm, setShowInitConfirm] = useState(false);
  const [showETAConfirm, setShowETAConfirm] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Calculate ETA totals
  const calculateETATotals = () => {
    let warningTotal = 0;
    let criticalTotal = 0;
    
    ETA_STAGES.forEach(stage => {
      const threshold = localThresholds.find(t => t.stage === stage);
      if (threshold) {
        warningTotal += threshold.warningDays || 0;
        criticalTotal += threshold.criticalDays || 0;
      }
    });
    
    const averageTotal = (warningTotal + criticalTotal) / 2;
    const extendedTotal = averageTotal + parseInt(localExtendedDays || '0', 10);
    
    return { warningTotal, criticalTotal, averageTotal, extendedTotal };
  };

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    // Use role hierarchy check instead of hardcoded ADMIN check
    if (!isAdminOrHigher) {
      router.push('/admin/board');
      return;
    }
    loadSettings();
  }, [user, router, isAdminOrHigher]);

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
        setLocalExtendedDays(systemData.EXTENDED_SHIPPING_DAYS?.value || '30'); // Initialize extended days
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

  const saveSpecialSettings = async () => {
    try {
      setSaving(true);
      
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
      
      // Validate extended shipping days
      const extendedNum = parseInt(localExtendedDays, 10);
      if (isNaN(extendedNum) || extendedNum < 0 || extendedNum > 100) {
        setMessage('Error: Extended shipping days must be between 0 and 100');
        setSaving(false);
        return;
      }
      
      // Save all settings
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
        }),
        fetch(`/api/settings/system/EXTENDED_SHIPPING_DAYS`, {
          method: 'PATCH',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: localExtendedDays })
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
      
      setSystemSettings(prev => ({
        ...prev,
        HOLIDAY_SEASON_START: { ...prev.HOLIDAY_SEASON_START, value: updates[0].value },
        HOLIDAY_SEASON_END: { ...prev.HOLIDAY_SEASON_END, value: updates[1].value },
        HOLIDAY_BUFFER_DAYS: { ...prev.HOLIDAY_BUFFER_DAYS, value: updates[2].value },
        EXTENDED_SHIPPING_DAYS: { ...prev.EXTENDED_SHIPPING_DAYS, value: updates[3].value }
      }));
      setMessage('✓ Special settings saved successfully');
      setHasUnsavedHolidayChanges(false);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Save error:', error);
      setMessage(`Error saving settings: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSpecialChange = (setter) => (e) => {
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

  if (!user || !isAdminOrHigher) return null;
  
  const { warningTotal, criticalTotal, averageTotal, extendedTotal } = calculateETATotals();

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
          {/* Special Settings Section */}
          <section className="settings-section">
            <h2>Special Shipping & Holiday Configuration</h2>
            <p className="section-desc">
              Configure holiday season dates and special shipping requirements for extended lead time items.
            </p>

            <div className="settings-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <div className="setting-item">
                <label>Holiday Season Start (MM-DD)</label>
                <input
                  type="text"
                  value={localStartDate}
                  onChange={handleSpecialChange(setLocalStartDate)}
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
                  onChange={handleSpecialChange(setLocalEndDate)}
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
                  onChange={handleSpecialChange(setLocalBufferDays)}
                  min="0"
                  max="100"
                />
                <small>Extra days for MANUFACTURING stage only during holidays (0-100)</small>
              </div>

              <div className="setting-item">
                <label style={{ color: 'var(--success)' }}>Extended Shipping Days ⭐</label>
                <input
                  type="number"
                  value={localExtendedDays}
                  onChange={handleSpecialChange(setLocalExtendedDays)}
                  min="0"
                  max="100"
                  style={{ borderColor: 'var(--success)' }}
                />
                <small style={{ color: 'var(--success)' }}>
                  Additional days for items marked as "Extended Shipping" (special machines)
                </small>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button 
                onClick={saveSpecialSettings} 
                disabled={saving || !hasUnsavedHolidayChanges}
                className="btn-init"
                style={{ opacity: (!hasUnsavedHolidayChanges || saving) ? 0.5 : 1 }}
              >
                {saving ? 'Saving...' : 'Save Special Settings'}
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
                    
                    const isETAStage = ETA_STAGES.includes(stage);

                    return (
                      <tr key={stage} style={{ 
                        backgroundColor: isETAStage ? 'transparent' : 'rgba(128, 128, 128, 0.1)',
                        opacity: isETAStage ? 1 : 0.7
                      }}>
                        <td className="stage-name">
                          {stage.replace(/_/g, ' ')}
                          {isETAStage && (
                            <span style={{ 
                              marginLeft: '8px', 
                              fontSize: '12px', 
                              color: 'var(--accent)',
                              fontWeight: 'normal'
                            }}>
                              (ETA)
                            </span>
                          )}
                        </td>
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
                  
                  {/* Separator row */}
                  <tr style={{ borderTop: '2px solid var(--accent)' }}>
                    <td colSpan="4" style={{ padding: '0', height: '2px', backgroundColor: 'transparent' }}></td>
                  </tr>
                  
                  {/* Totals row */}
                  <tr style={{ 
                    backgroundColor: 'rgba(255, 170, 0, 0.1)', 
                    fontWeight: 'bold',
                    borderTop: '2px solid var(--accent)'
                  }}>
                    <td className="stage-name">
                      STANDARD ETA TOTALS
                      <div style={{ 
                        fontSize: '12px', 
                        fontWeight: 'normal', 
                        marginTop: '4px',
                        color: 'var(--text-dim)'
                      }}>
                        (Includes stages through DELIVERED only)
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--accent)' }}>
                      {warningTotal} days
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--accent)' }}>
                      {criticalTotal} days
                    </td>
                    <td style={{ color: 'var(--accent)' }}>
                      Average: {averageTotal.toFixed(1)} days
                      <div style={{ 
                        fontSize: '12px', 
                        fontWeight: 'normal', 
                        marginTop: '4px',
                        color: 'var(--text-dim)'
                      }}>
                        Base ETA calculation for standard items
                      </div>
                    </td>
                  </tr>
                  
                  {/* Extended Shipping Totals */}
                  <tr style={{ 
                    backgroundColor: 'rgba(0, 255, 170, 0.1)', 
                    fontWeight: 'bold'
                  }}>
                    <td className="stage-name" style={{ color: 'var(--success)' }}>
                      EXTENDED SHIPPING TOTALS ⭐
                      <div style={{ 
                        fontSize: '12px', 
                        fontWeight: 'normal', 
                        marginTop: '4px',
                        color: 'var(--text-dim)'
                      }}>
                        (For items marked as Extended Shipping)
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--success)' }}>
                      {warningTotal + parseInt(localExtendedDays || '0', 10)} days
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--success)' }}>
                      {criticalTotal + parseInt(localExtendedDays || '0', 10)} days
                    </td>
                    <td style={{ color: 'var(--success)' }}>
                      Average: {extendedTotal.toFixed(1)} days
                      <div style={{ 
                        fontSize: '12px', 
                        fontWeight: 'normal', 
                        marginTop: '4px',
                        color: 'var(--text-dim)'
                      }}>
                        Standard ETA + {localExtendedDays || '0'} extended days
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            {/* ETA Calculation Example */}
            <div style={{
              marginTop: '1.5rem',
              padding: '1rem',
              backgroundColor: 'rgba(0, 255, 170, 0.05)',
              border: '1px solid rgba(0, 255, 170, 0.2)',
              borderRadius: '8px'
            }}>
              <h4 style={{ marginTop: 0, color: 'var(--success)' }}>📅 ETA Calculation Examples</h4>
              
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ margin: '0.5rem 0', fontSize: '14px', fontWeight: 'bold' }}>
                  Standard Items:
                </p>
                <p style={{ margin: '0.25rem 0 0.5rem 1.5rem', fontSize: '14px', color: 'var(--text-dim)' }}>
                  Order Date + <strong>{averageTotal.toFixed(0)} days</strong> = Estimated Delivery
                </p>
              </div>
              
              <div>
                <p style={{ margin: '0.5rem 0', fontSize: '14px', fontWeight: 'bold', color: 'var(--success)' }}>
                  Extended Shipping Items (Special Machines):
                </p>
                <p style={{ margin: '0.25rem 0 0.5rem 1.5rem', fontSize: '14px', color: 'var(--text-dim)' }}>
                  Order Date + <strong>{extendedTotal.toFixed(0)} days</strong> = Estimated Delivery
                </p>
              </div>
              
              <p style={{ margin: '1rem 0 0', fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                Note: If ANY item in an order requires extended shipping, the entire order uses the extended ETA.
              </p>
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
              </p>
              <p style={{ marginTop: '0.5rem', fontSize: '14px' }}>
                Standard orders: Order Date + <strong>{averageTotal.toFixed(0)} days</strong> = ETA
              </p>
              <p style={{ marginTop: '0.25rem', fontSize: '14px' }}>
                Extended shipping orders: Order Date + <strong>{extendedTotal.toFixed(0)} days</strong> = ETA
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
              <li><strong>Holiday Adjustment</strong>: Buffer days are ONLY added to MANUFACTURING stage (Oct-Dec)</li>
              <li><strong style={{ color: 'var(--success)' }}>Extended Shipping</strong>: Additional days for special machines that require extended lead times</li>
              <li><strong>ETA Calculation</strong>: Uses average of Warning and Critical days for stages through DELIVERED</li>
              <li><strong>Order-Level ETA</strong>: If ANY item has extended shipping, the entire order uses the extended timeline</li>
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
                <li>Standard items: Order Date + <strong>{averageTotal.toFixed(0)} days</strong></li>
                <li>Extended shipping items: Order Date + <strong>{extendedTotal.toFixed(0)} days</strong></li>
                <li>Orders with ANY extended shipping items will use the extended timeline</li>
                <li>This process cannot be undone</li>
              </ul>
            </div>
            <p style={{ marginTop: '1rem', color: 'var(--text-dim)', fontSize: '14px' }}>
              <strong>When to use this:</strong> After updating stage thresholds or extended shipping days.
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
