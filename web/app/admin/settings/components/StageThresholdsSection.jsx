// Stage Thresholds Section Component
// Manages stage time thresholds configuration

import { STAGES, ETA_STAGES } from '../constants';

export default function StageThresholdsSection({
  localThresholds,
  handleThresholdChange,
  saveThresholds,
  hasUnsavedThresholdChanges,
  saving,
  setShowInitConfirm,
  calculateETATotals
}) {
  const { warningTotal, criticalTotal, averageTotal, extendedTotal, localExtendedDays } = calculateETATotals();

  return (
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
  );
}
