"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import NotificationBar from "@/components/NotificationBar";
import QuickActions from "@/components/QuickActions";
import CommissionDashboardWidget from "@/components/CommissionDashboardWidget";
import Link from "next/link";
import "./dashboard.css";

export default function AdminDashboard() {
  const { user } = useAuth();
  const router = useRouter();

  // Check if user is manufacturer
  const isManufacturer = user?.role === "MANUFACTURER";
  const isAgent = user?.role === "AGENT";
  const isAdmin = user?.role === "ADMIN";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isAccountant = user?.role === "ACCOUNTANT";

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  // Redirect manufacturers to the board page
  useEffect(() => {
    if (isManufacturer) {
      router.push("/admin/board");
    }
  }, [isManufacturer, router]);

  if (!user || isManufacturer) {
    return null;
  }

  return (
    <div className="dashboard-container">
      <TopNav />
      <NotificationBar />
      
      <div className="dashboard-content">
        <div className="dashboard-header">
          <h1>Welcome back, {user.name}</h1>
          <p className="dashboard-subtitle">Here's what's happening with your orders today</p>
        </div>

        {/* Quick Actions - Hide for agents */}
        {!isAgent && <QuickActions />}

        {/* Commission Widget */}
        <CommissionDashboardWidget user={user} />

        {/* Quick Links Grid */}
        <div className="quick-links-section">
          <h2>Quick Access</h2>
          <div className="quick-links-grid">
            <Link href="/admin/board" className="quick-link-card">
              <div className="quick-link-icon board">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
              </div>
              <div className="quick-link-content">
                <h3>Order Board</h3>
                <p>View and manage all orders</p>
              </div>
            </Link>

            {/* Hide certain links from agents */}
            {!isAgent && (
              <>
                <Link href="/admin/orders/new" className="quick-link-card">
                  <div className="quick-link-icon new-order">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <div className="quick-link-content">
                    <h3>New Order</h3>
                    <p>Create a new order</p>
                  </div>
                </Link>

                <Link href="/admin/customers" className="quick-link-card">
                  <div className="quick-link-icon customers">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div className="quick-link-content">
                    <h3>Customers</h3>
                    <p>Manage customer accounts</p>
                  </div>
                </Link>
              </>
            )}

            <Link href="/admin/reports" className="quick-link-card">
              <div className="quick-link-icon reports">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="quick-link-content">
                <h3>Reports</h3>
                <p>View sales and analytics</p>
              </div>
            </Link>

            {/* Commission link - different based on role */}
            {(isAgent || isAdmin) ? (
              <Link href="/my-commissions" className="quick-link-card">
                <div className="quick-link-icon commissions">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="quick-link-content">
                  <h3>My Commissions</h3>
                  <p>View your earnings</p>
                </div>
              </Link>
            ) : (
              <Link href="/admin/commissions" className="quick-link-card">
                <div className="quick-link-icon commissions">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="quick-link-content">
                  <h3>Commission Management</h3>
                  <p>Manage all commissions</p>
                </div>
              </Link>
            )}

            {/* Admin-only links */}
            {(isSuperAdmin || isAccountant) && (
              <Link href="/admin/commission-settings" className="quick-link-card">
                <div className="quick-link-icon settings">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="quick-link-content">
                  <h3>Commission Settings</h3>
                  <p>Configure rates and stages</p>
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
