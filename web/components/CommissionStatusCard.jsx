"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import "./CommissionStatusCard.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function CommissionStatusCard({ orderId, user }) {
  const { getAuthHeaders } = useAuth();
  const [commission, setCommission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check user permissions
  const canViewCommission = user?.role === "SUPER_ADMIN" || 
                           user?.role === "ACCOUNTANT" || 
                           user?.role === "ADMIN";

  useEffect(() => {
    if (orderId && canViewCommission) {
      loadCommission();
    }
  }, [orderId, canViewCommission]);

  async function loadCommission() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE}/commissions/order/${orderId}`, {
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        setCommission(data);
      } else if (res.status === 404) {
        // No commission exists for this order yet
        setCommission(null);
      } else {
        throw new Error(`Failed to load commission: ${res.status}`);
      }
    } catch (e) {
      console.error("Failed to load commission:", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Don't show card if user doesn't have permission
  if (!canViewCommission) {
    return null;
  }

  if (loading) {
    return (
      <div className="commission-status-card">
        <div className="card-header">
          <h3>💰 Commission Status</h3>
        </div>
        <div className="card-body">
          <div className="loading-state">Loading commission data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="commission-status-card error">
        <div className="card-header">
          <h3>💰 Commission Status</h3>
        </div>
        <div className="card-body">
          <div className="error-state">Failed to load commission data</div>
        </div>
      </div>
    );
  }

  if (!commission) {
    return (
      <div className="commission-status-card">
        <div className="card-header">
          <h3>💰 Commission Status</h3>
        </div>
        <div className="card-body">
          <div className="empty-state">
            <p>No commission calculated yet</p>
            <span className="help-text">Commission will be calculated when order has sales rep and item prices</span>
          </div>
        </div>
      </div>
    );
  }

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);
  };

  // Get status badge class
  const getStatusClass = (status) => {
    switch(status) {
      case 'AWAITING_PRICES': return 'awaiting';
      case 'CALCULATED': return 'calculated';
      case 'PARTIAL_PAID': return 'partial';
      case 'FULLY_PAID': return 'paid';
      case 'FLAGGED': return 'flagged';
      default: return '';
    }
  };

  // Get payout status badge class
  const getPayoutStatusClass = (status) => {
    switch(status) {
      case 'WAITING': return 'waiting';
      case 'PENDING': return 'pending';
      case 'APPROVED': return 'approved';
      case 'PAID': return 'paid';
      case 'REJECTED': return 'rejected';
      default: return '';
    }
  };

  return (
    <div className="commission-status-card">
      <div className="card-header">
        <h3>💰 Commission Status</h3>
        {commission.isFlagged && (
          <span className="flag-indicator" title={commission.flagReason}>⚠️ Flagged</span>
        )}
      </div>
      
      <div className="card-body">
        <div className="commission-info">
          <div className="info-row">
            <span className="label">Sales Rep:</span>
            <span className="value">{commission.salesPersonName || 'Not assigned'}</span>
          </div>
          
          <div className="info-row">
            <span className="label">Commission Rate:</span>
            <span className="value">{commission.commissionRate}%</span>
          </div>
          
          <div className="info-row">
            <span className="label">Order Subtotal:</span>
            <span className="value">{formatCurrency(commission.orderSubtotal)}</span>
          </div>

          {commission.orderDiscount > 0 && (
            <div className="info-row">
              <span className="label">Discount:</span>
              <span className="value" style={{ color: '#dc2626' }}>-{formatCurrency(commission.orderDiscount)}</span>
            </div>
          )}

          <div className="info-row">
            <span className="label">Order Net Total:</span>
            <span className="value">{formatCurrency(commission.orderNetTotal)}</span>
          </div>

          <div className="info-row highlight">
            <span className="label">Total Commission:</span>
            <span className="value large">{formatCurrency(commission.totalCommissionAmount)}</span>
          </div>
          
          <div className="info-row">
            <span className="label">Status:</span>
            <span className={`status-badge ${getStatusClass(commission.status)}`}>
              {commission.status.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {commission.payouts && commission.payouts.length > 0 && (
          <div className="payouts-section">
            <h4>Payouts:</h4>
            <div className="payouts-list">
              {commission.payouts.map((payout, index) => (
                <div key={payout.id || index} className="payout-item">
                  <span className="payout-stage">{payout.stage.replace(/_/g, ' ')}</span>
                  <span className="payout-percentage">({payout.percentage}%)</span>
                  <span className="payout-amount">{formatCurrency(payout.amount)}</span>
                  <span className={`payout-status ${getPayoutStatusClass(payout.status)}`}>
                    {payout.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {commission.flagReason && (
          <div className="flag-details">
            <span className="flag-icon">⚠️</span>
            <span className="flag-message">{commission.flagReason.replace(/_/g, ' ')}</span>
          </div>
        )}

        <div className="card-actions">
          <Link href={`/admin/commissions?orderId=${orderId}`} className="view-link">
            View Full Commission Details →
          </Link>
        </div>
      </div>
    </div>
  );
}
