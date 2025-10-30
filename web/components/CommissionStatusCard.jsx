// Commission Status Card for Order Edit Page

import { useState, useEffect } from 'react';
import { formatCurrency, formatPercentage, getPayoutStatusStyle, formatDate } from '@/lib/commissionUtils';
import './CommissionStatusCard.css';

export default function CommissionStatusCard({ orderId, user }) {
  const [loading, setLoading] = useState(true);
  const [commission, setCommission] = useState(null);
  const [error, setError] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (orderId) {
      fetchCommissionData();
    }
  }, [orderId]);

  const fetchCommissionData = async () => {
    try {
      const headers = { 'x-auth-token': localStorage.getItem('token') };
      const res = await fetch(`/api/commissions/order/${orderId}`, { headers });
      
      if (res.status === 404) {
        // No commission for this order yet
        setCommission(null);
        setError('No commission calculated yet');
      } else if (res.ok) {
        const data = await res.json();
        setCommission(data);
      } else {
        setError('Failed to load commission data');
      }
    } catch (err) {
      console.error('Error fetching commission:', err);
      setError('Error loading commission data');
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    if (!commission || !confirm('Are you sure you want to recalculate this commission?')) {
      return;
    }

    try {
      const headers = { 
        'x-auth-token': localStorage.getItem('token'),
        'Content-Type': 'application/json'
      };
      
      const res = await fetch(
        `/api/commissions/${commission.id}/recalculate`,
        { method: 'POST', headers }
      );
      
      if (res.ok) {
        const updatedCommission = await res.json();
        setCommission(updatedCommission);
        alert('Commission recalculated successfully');
      } else {
        const error = await res.text();
        alert(`Failed to recalculate: ${error}`);
      }
    } catch (err) {
      console.error('Error recalculating commission:', err);
      alert('Error recalculating commission');
    }
  };

  const handleUnflag = async () => {
    if (!commission || !confirm('Are you sure you want to unflag this commission?')) {
      return;
    }

    try {
      const headers = { 
        'x-auth-token': localStorage.getItem('token'),
        'Content-Type': 'application/json'
      };
      
      const res = await fetch(
        `/api/commissions/${commission.id}/unflag`,
        { 
          method: 'POST', 
          headers,
          body: JSON.stringify({ reviewNotes: 'Manually unflagged by admin' })
        }
      );
      
      if (res.ok) {
        const updatedCommission = await res.json();
        setCommission(updatedCommission);
        alert('Commission unflagged successfully');
      } else {
        const error = await res.text();
        alert(`Failed to unflag: ${error}`);
      }
    } catch (err) {
      console.error('Error unflagging commission:', err);
      alert('Error unflagging commission');
    }
  };

  if (loading) {
    return (
      <div className="commission-status-card">
        <div className="card-loading">Loading commission data...</div>
      </div>
    );
  }

  if (!commission) {
    return (
      <div className="commission-status-card no-commission">
        <div className="card-header">
          <h3>💰 Commission Status</h3>
        </div>
        <div className="card-content">
          <p className="no-commission-message">{error || 'No commission calculated for this order'}</p>
          <div className="card-help">
            <p>Commission will be calculated when:</p>
            <ul>
              <li>Sales person (SKU) is assigned</li>
              <li>Item prices are entered</li>
              <li>Order is saved</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const getStatusBadgeClass = (status) => {
    const statusMap = {
      'AWAITING_PRICES': 'status-warning',
      'CALCULATED': 'status-info',
      'PARTIAL_PAID': 'status-partial',
      'FULLY_PAID': 'status-success',
      'FLAGGED': 'status-error',
      'CANCELLED': 'status-cancelled'
    };
    return statusMap[status] || 'status-default';
  };

  return (
    <div className={`commission-status-card ${commission.isFlagged ? 'flagged' : ''}`}>
      <div className="card-header">
        <h3>💰 Commission Status</h3>
        <button 
          className="toggle-details-btn"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>
      </div>
      
      <div className="card-content">
        <div className="commission-summary">
          <div className="summary-item">
            <span className="summary-label">Sales Rep:</span>
            <span className="summary-value">{commission.salesPersonName || 'Not assigned'}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Rate:</span>
            <span className="summary-value">{formatPercentage(commission.commissionRate)}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Total Commission:</span>
            <span className="summary-value highlight">
              {formatCurrency(commission.totalCommissionAmount)}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Status:</span>
            <span className={`status-badge ${getStatusBadgeClass(commission.status)}`}>
              {commission.status}
            </span>
          </div>
        </div>

        {commission.isFlagged && (
          <div className="flag-alert">
            <div className="flag-icon">⚠️</div>
            <div className="flag-content">
              <div className="flag-reason">{commission.flagReason}</div>
              {commission.flagDetails && (
                <div className="flag-details">{commission.flagDetails}</div>
              )}
            </div>
            {user && ['SUPER_ADMIN', 'ACCOUNTANT'].includes(user.role) && (
              <button className="btn-unflag" onClick={handleUnflag}>Unflag</button>
            )}
          </div>
        )}

        {showDetails && commission.payouts && commission.payouts.length > 0 && (
          <div className="payouts-section">
            <h4>Payout Schedule</h4>
            <table className="payouts-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Percentage</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {commission.payouts.map((payout, idx) => (
                  <tr key={idx}>
                    <td>{payout.stage}</td>
                    <td>{formatPercentage(payout.percentage)}</td>
                    <td className="amount">{formatCurrency(payout.amount)}</td>
                    <td>
                      <span className={`status-badge ${getPayoutStatusStyle(payout.status)}`}>
                        {payout.status}
                      </span>
                    </td>
                    <td>
                      {payout.paidAt ? formatDate(payout.paidAt, true) :
                       payout.approvedAt ? formatDate(payout.approvedAt, true) :
                       'Pending'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="2">Total</td>
                  <td className="amount total">
                    {formatCurrency(commission.totalCommissionAmount)}
                  </td>
                  <td colSpan="2">
                    {commission.payouts.filter(p => p.status === 'PAID').length} of {commission.payouts.length} paid
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {showDetails && commission.notes && (
          <div className="commission-notes">
            <h4>Notes</h4>
            <p>{commission.notes}</p>
          </div>
        )}

        {showDetails && commission.calculatedAt && (
          <div className="commission-metadata">
            <div className="metadata-item">
              <span className="metadata-label">Calculated:</span>
              <span className="metadata-value">{formatDate(commission.calculatedAt, true)}</span>
            </div>
            {commission.lastReviewedAt && (
              <div className="metadata-item">
                <span className="metadata-label">Last Reviewed:</span>
                <span className="metadata-value">
                  {formatDate(commission.lastReviewedAt, true)} by {commission.lastReviewedBy}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="card-actions">
          <a 
            href={`/admin/commissions/${commission.id}`} 
            className="btn btn-secondary"
            target="_blank"
            rel="noopener noreferrer"
          >
            View Full Details
          </a>
          
          {user && user.role === 'SUPER_ADMIN' && commission.status !== 'FULLY_PAID' && (
            <button className="btn btn-primary" onClick={handleRecalculate}>
              Recalculate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
