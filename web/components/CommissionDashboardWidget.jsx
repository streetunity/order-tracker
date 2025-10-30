// Dashboard widgets for commission overview on main admin page

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/commissionUtils';
import './CommissionDashboardWidget.css';

export default function CommissionDashboardWidget({ user }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    pendingApprovals: 0,
    pendingAmount: 0,
    unpaidTotal: 0,
    thisMonth: 0,
    flaggedCount: 0
  });

  useEffect(() => {
    if (user && ['SUPER_ADMIN', 'ACCOUNTANT'].includes(user.role)) {
      fetchCommissionStats();
    }
  }, [user]);

  const fetchCommissionStats = async () => {
    try {
      const headers = { 'x-auth-token': localStorage.getItem('token') };
      
      // Fetch pending approvals
      const pendingRes = await fetch('/api/commissions/payouts/pending', { headers });
      if (pendingRes.ok) {
        const pendingData = await pendingRes.json();
        const pendingTotal = pendingData.reduce((sum, group) => sum + group.total, 0);
        const pendingCount = pendingData.reduce((sum, group) => sum + group.payouts.length, 0);
        
        setStats(prev => ({
          ...prev,
          pendingApprovals: pendingCount,
          pendingAmount: pendingTotal
        }));
      }
      
      // Fetch unpaid total
      const unpaidRes = await fetch('/api/commissions/unpaid-total', { headers });
      if (unpaidRes.ok) {
        const unpaidData = await unpaidRes.json();
        setStats(prev => ({ ...prev, unpaidTotal: unpaidData.total }));
      }
      
      // Fetch this month's commissions
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const monthlyRes = await fetch(
        `/api/commissions/reports/monthly?year=${currentYear}`,
        { headers }
      );
      if (monthlyRes.ok) {
        const monthlyData = await monthlyRes.json();
        const thisMonthTotal = monthlyData[currentMonth]?.calculated || 0;
        setStats(prev => ({ ...prev, thisMonth: thisMonthTotal }));
      }
      
      // Fetch flagged count
      const flaggedRes = await fetch('/api/commissions/flagged', { headers });
      if (flaggedRes.ok) {
        const flaggedData = await flaggedRes.json();
        setStats(prev => ({ ...prev, flaggedCount: flaggedData.length }));
      }
    } catch (err) {
      console.error('Error fetching commission stats:', err);
    } finally {
      setLoading(false);
    }
  };

  // Don't show widget for non-authorized users
  if (!user || !['SUPER_ADMIN', 'ACCOUNTANT'].includes(user.role)) {
    return null;
  }

  if (loading) {
    return (
      <div className="commission-dashboard-widget">
        <div className="widget-loading">Loading commission data...</div>
      </div>
    );
  }

  return (
    <div className="commission-dashboard-widget">
      <div className="widget-header">
        <h3>Commission Overview</h3>
        <a href="/admin/commissions" className="view-all-link">View All →</a>
      </div>
      
      <div className="widget-cards">
        <div className="widget-card">
          <div className="widget-card-icon pending">⏳</div>
          <div className="widget-card-content">
            <div className="widget-card-label">Pending Approvals</div>
            <div className="widget-card-value">{stats.pendingApprovals}</div>
            <div className="widget-card-detail">
              {formatCurrency(stats.pendingAmount)}
            </div>
          </div>
          <a href="/admin/commissions?tab=pending" className="widget-card-link">
            Review →
          </a>
        </div>
        
        <div className="widget-card">
          <div className="widget-card-icon money">💰</div>
          <div className="widget-card-content">
            <div className="widget-card-label">Unpaid Total</div>
            <div className="widget-card-value">
              {formatCurrency(stats.unpaidTotal, false)}
            </div>
            <div className="widget-card-detail">
              Ready for payment
            </div>
          </div>
          <a href="/admin/commissions?tab=approved" className="widget-card-link">
            Pay Now →
          </a>
        </div>
        
        <div className="widget-card">
          <div className="widget-card-icon chart">📊</div>
          <div className="widget-card-content">
            <div className="widget-card-label">This Month</div>
            <div className="widget-card-value">
              {formatCurrency(stats.thisMonth, false)}
            </div>
            <div className="widget-card-detail">
              Commissions calculated
            </div>
          </div>
          <a href="/admin/commissions/reports" className="widget-card-link">
            View Report →
          </a>
        </div>
        
        {stats.flaggedCount > 0 && (
          <div className="widget-card flagged">
            <div className="widget-card-icon warning">⚠️</div>
            <div className="widget-card-content">
              <div className="widget-card-label">Flagged</div>
              <div className="widget-card-value">{stats.flaggedCount}</div>
              <div className="widget-card-detail">
                Need attention
              </div>
            </div>
            <a href="/admin/commissions?tab=flagged" className="widget-card-link">
              Review →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
