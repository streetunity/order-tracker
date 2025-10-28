'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import TopNav from '@/components/TopNav';
import SpecialSettingsSection from './components/SpecialSettingsSection';
import StageThresholdsSection from './components/StageThresholdsSection';
import ETAManagementSection from './components/ETAManagementSection';
import ConfirmationDialogs from './components/ConfirmationDialogs';
import { settingsApi } from './services/settingsApi';
import { STAGES, ETA_STAGES } from './constants';
import './settings.css';

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
  const [localExtendedDays, setLocalExtendedDays] = useState('');
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
    
    return { warningTotal, criticalTotal, averageTotal, extendedTotal, localExtendedDays };
  };

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (!isAdminOrHigher) {
      router.push('/admin/board');
      return;
    }
    loadSettings();
  }, [user, router, isAdminOrHigher]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [thresholdsData, systemData] = await Promise.all([
        settingsApi.loadThresholds(getAuthHeaders),
        settingsApi.loadSystemSettings(getAuthHeaders)
      ]);

      setThresholds(thresholdsData);
      setLocalThresholds(JSON.parse(JSON.stringify(thresholdsData))); // Deep copy
      setSystemSettings(systemData);
      
      // Initialize local state
      setLocalStartDate(systemData.HOLIDAY_SEASON_START?.value || '10-01');
      setLocalEndDate(systemData.HOLIDAY_SEASON_END?.value || '12-31');
      setLocalBufferDays(systemData.HOLIDAY_BUFFER_DAYS?.value || '25');
      setLocalExtendedDays(systemData.EXTENDED_SHIPPING_DAYS?.value || '30');
      setHasUnsavedHolidayChanges(false);
      setHasUnsavedThresholdChanges(false);
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
      await settingsApi.initializeThresholds(getAuthHeaders);
      setMessage('✓ Initialized default thresholds');
      await loadSettings();
      setShowInitConfirm(false);
    } catch (error) {
      setMessage('Error initializing thresholds');
    } finally {
      setSaving(false);
    }
  };

  const recalculateETAs = async () => {
    try {
      setRecalculating(true);
      const data = await settingsApi.recalculateETAs(getAuthHeaders);
      setMessage(`✓ ${data.message}`);
      setShowETAConfirm(false);
      setTimeout(() => setMessage(''), 5000);
    } catch (error) {
      console.error('Recalculate ETAs error:', error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setRecalculating(false);
    }
  };

  const saveThresholds = async () => {
    try {
      setSaving(true);
      const updates = await settingsApi.saveAllThresholds(localThresholds, getAuthHeaders);
      setThresholds(updates);
      setLocalThresholds(JSON.parse(JSON.stringify(updates))); // Deep copy
      setMessage('✓ Stage thresholds saved successfully');
      setHasUnsavedThresholdChanges(false);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Save thresholds error:', error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const saveSpecialSettings = async () => {
    try {
      setSaving(true);
      
      // Validate date format
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
      
      const updates = await settingsApi.saveSpecialSettings({
        startDate: localStartDate,
        endDate: localEndDate,
        bufferDays: localBufferDays,
        extendedDays: localExtendedDays
      }, getAuthHeaders);
      
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
    <>
      <TopNav />
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
            <SpecialSettingsSection
              localStartDate={localStartDate}
              setLocalStartDate={setLocalStartDate}
              localEndDate={localEndDate}
              setLocalEndDate={setLocalEndDate}
              localBufferDays={localBufferDays}
              setLocalBufferDays={setLocalBufferDays}
              localExtendedDays={localExtendedDays}
              setLocalExtendedDays={setLocalExtendedDays}
              hasUnsavedHolidayChanges={hasUnsavedHolidayChanges}
              handleSpecialChange={handleSpecialChange}
              saveSpecialSettings={saveSpecialSettings}
              saving={saving}
            />

            {/* Stage Thresholds Section */}
            <StageThresholdsSection
              localThresholds={localThresholds}
              handleThresholdChange={handleThresholdChange}
              saveThresholds={saveThresholds}
              hasUnsavedThresholdChanges={hasUnsavedThresholdChanges}
              saving={saving}
              setShowInitConfirm={setShowInitConfirm}
              calculateETATotals={calculateETATotals}
            />

            {/* ETA Management Section */}
            <ETAManagementSection
              averageTotal={averageTotal}
              extendedTotal={extendedTotal}
              setShowETAConfirm={setShowETAConfirm}
              recalculating={recalculating}
            />

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

        {/* Confirmation Dialogs */}
        <ConfirmationDialogs
          showInitConfirm={showInitConfirm}
          setShowInitConfirm={setShowInitConfirm}
          initializeThresholds={initializeThresholds}
          showETAConfirm={showETAConfirm}
          setShowETAConfirm={setShowETAConfirm}
          recalculateETAs={recalculateETAs}
          recalculating={recalculating}
          saving={saving}
          averageTotal={averageTotal}
          extendedTotal={extendedTotal}
        />
      </main>
    </>
  );
}
