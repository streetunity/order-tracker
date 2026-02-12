"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import "./CommissionDashboardWidget.css";

// Use API proxy routes - never call backend directly from browser

export default function CommissionDashboardWidget({ user }) {
  const { getAuthHeaders } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check user role for proper routing and display
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isAccountant = user?.role === "ACCOUNTANT";
  const isAgent = user?.role === "AGENT";
  const isAdmin = user?.role === "ADMIN";

  // Determine if user can see all commissions or just their own
  const canSeeAllCommissions = isSuperAdmin || isAccountant;
  const canSeeCommissions = isAgent || isAdmin || isSuperAdmin || isAccountant;

  useEffect(() => {
    if (user && canSeeCommissions) {
      loadCommissionStats();
    }
  }, [user]);

  async function loadCommissionStats() {
    try {
      setLoading(true);
      
      // Choose endpoint based on role - use API proxy routes
      const endpoint = canSeeAllCommissions
        ? `/api/commissions/dashboard-stats`
        : `/api/commissions/my/summary`;

      const res = await fetch(endpoint, {
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error("Failed to load commission stats:", e);
    } finally {
      setLoading(false);
    }
  }

  // Don't show widget for users without commission access
  if (!canSeeCommissions) {
    return null;
  }

  // Determine the link destination based on role
  const getCommissionLink = () => {
    if (isAgent || isAdmin) {
      return "/my-commissions";
    }
    return "/admin/commissions";
  };

  if (loading) {
    return (
      <div className="commission-widget">
        <div className="widget-loading">
          <div className="shimmer"></div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  return (
    <div className="commission-dashboard-widget">
      <div className="widget-grid">
        {canSeeAllCommissions ? (
          <>
            {/* Admin/Accountant view - 4 cards */}
            <Link href="/admin/commissions?tab=pending" className="widget-card">
              <div className="widget-icon pending">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="widget-content">
                <div className="widget-label">Pending Approvals</div>
                <div className="widget-value">{stats.pendingCount || 0}</div>
                <div className="widget-action">View All →</div>
              </div>
            </Link>

            <Link href="/admin/commissions?tab=approved" className="widget-card">
              <div className="widget-icon approved">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="widget-content">
                <div className="widget-label">Unpaid Total</div>
                <div className="widget-value">{formatCurrency(stats.unpaidTotal || 0)}</div>
                <div className="widget-action">View All →</div>
              </div>
            </Link>

            <Link href="/admin/commissions/reports" className="widget-card">
              <div className="widget-icon report">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="widget-content">
                <div className="widget-label">This Month</div>
                <div className="widget-value">{formatCurrency(stats.monthlyTotal || 0)}</div>
                <div className="widget-action">View Report →</div>
              </div>
            </Link>

            <Link href="/admin/commissions?tab=flagged" className="widget-card">
              <div className="widget-icon flagged">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                </svg>
              </div>
              <div className="widget-content">
                <div className="widget-label">Flagged</div>
                <div className="widget-value">{stats.flaggedCount || 0}</div>
                <div className="widget-action">Review →</div>
              </div>
            </Link>
          </>
        ) : (
          <>
            {/* Agent view - 2 cards */}
            <Link href="/my-commissions" className="widget-card large">
              <div className="widget-icon earnings">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="widget-content">
                <div className="widget-label">YTD Earnings</div>
                <div className="widget-value">{formatCurrency(stats.ytdTotal || 0)}</div>
                <div className="widget-sublabel">
                  <span className="pending">{formatCurrency(stats.ytdPending || 0)} pending</span>
                </div>
                <div className="widget-action">View Details →</div>
              </div>
            </Link>

            <Link href="/my-commissions" className="widget-card large">
              <div className="widget-icon month">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="widget-content">
                <div className="widget-label">This Month</div>
                <div className="widget-value">{formatCurrency(stats.monthlyTotal || 0)}</div>
                <div className="widget-sublabel">
                  {stats.monthlyPendingCount || 0} orders pending
                </div>
                <div className="widget-action">View History →</div>
              </div>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
