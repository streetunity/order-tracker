"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import "./TopNav.css";

export default function TopNav() {
  const { user, logout, getAuthHeaders, isAdmin } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [yearlyTotal, setYearlyTotal] = useState(null);
  const dropdownRef = useRef(null);
  const pathname = usePathname();

  // Check if user is manufacturer or broker (limited access users)
  const isManufacturer = user?.role === 'MANUFACTURER';
  const isBroker = user?.role === 'BROKER';
  const isLimitedAccess = isManufacturer || isBroker;

  useEffect(() => {
    if (user && !isLimitedAccess) {
      loadNotificationCount();
      loadYearlyTotal();
    }
  }, [user, isLimitedAccess]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function loadNotificationCount() {
    try {
      const res = await fetch(`/api/notifications/stats`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setNotificationCount(data.unread || 0);
      }
    } catch (e) {
      console.error("Failed to load notification count:", e);
    }
  }

  async function loadYearlyTotal() {
    try {
      const res = await fetch("/api/orders/yearly-total", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setYearlyTotal(data);
      }
    } catch (e) {
      console.error("Failed to load yearly total:", e);
    }
  }

  function getInitials(name) {
    if (!name) return "?";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  const isActive = (path) => pathname === path;

  if (!user) return null;

  return (
    <nav className="top-nav">
      <div className="nav-container">
        <div className="nav-left">
          <div className="logo-section">
            <div className="logo-icon">
              <img src="/smt-logo.png" alt="SMT Logo" />
            </div>
            <span className="logo-text">Order Tracker</span>
          </div>

          <div className="nav-divider"></div>

          <div className="nav-links">
            {/* Board - visible to all except regular brokers, but super admins see it always */}
            {!isBroker && (
              <Link href="/admin/board" className={`nav-link ${isActive("/admin/board") ? "active" : ""}`}>
                <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                Board
              </Link>
            )}

            {/* Hide everything else from manufacturers and brokers */}
            {!isLimitedAccess && (
              <>
                <Link href="/admin/customers" className={`nav-link ${isActive("/admin/customers") ? "active" : ""}`}>
                  <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Customers
                </Link>
                <Link href="/admin/orders" className={`nav-link ${isActive("/admin/orders") ? "active" : ""}`}>
                  <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Orders
                </Link>
                <Link href="/admin/reports" className={`nav-link ${isActive("/admin/reports") ? "active" : ""}`}>
                  <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Reports
                </Link>
                <Link href="/admin/commissions" className={`nav-link ${isActive("/admin/commissions") ? "active" : ""}`}>
                  <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Commissions
                </Link>
              </>
            )}
            
            {isAdmin && (
              <>
                <Link href="/admin/users" className={`nav-link ${isActive("/admin/users") ? "active" : ""}`}>
                  <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  Users
                </Link>
                <Link href="/admin/manufacturers" className={`nav-link ${isActive("/admin/manufacturers") ? "active" : ""}`}>
                  <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Manufacturers
                </Link>
                <Link href="/history" className={`nav-link ${isActive("/history") ? "active" : ""}`}>
                  <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Audit
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="nav-right">
          {/* Hide sales badge from manufacturers and brokers */}
          {!isLimitedAccess && yearlyTotal && (
            <div className="sales-badge">
              <div className="sales-badge-label">{new Date().getFullYear()} Sales</div>
              <div className="sales-badge-value">{yearlyTotal.formatted}</div>
            </div>
          )}

          {/* Hide notifications from manufacturers and brokers for now */}
          {!isLimitedAccess && (
            <Link href="/admin/notifications" className="icon-button">
              <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
              </svg>
              {notificationCount > 0 && (
                <div className="notification-badge">{notificationCount}</div>
              )}
            </Link>
          )}

          <div className="user-menu" onClick={() => setDropdownOpen(!dropdownOpen)} ref={dropdownRef}>
            <div className="user-avatar">{getInitials(user.name)}</div>
            <div className="user-info">
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.role}</div>
            </div>
            <svg className="dropdown-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
            </svg>

            {dropdownOpen && (
              <div className="user-dropdown">
                <div className="dropdown-header">
                  <div className="dropdown-user-name">{user.name}</div>
                  <div className="dropdown-user-email">{user.email || "No email"}</div>
                </div>
                <div className="dropdown-divider"></div>
                <Link href="/admin/profile" className="dropdown-item">
                  <svg className="dropdown-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                  </svg>
                  My Profile
                </Link>

                {/* Broker Portal link for super admins only */}
                {user?.role === 'SUPER_ADMIN' && (
                  <>
                    <div className="dropdown-divider"></div>
                    <Link href="/broker/dashboard" className="dropdown-item">
                      <svg className="dropdown-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                      Broker Portal
                    </Link>
                  </>
                )}

                {/* Shipment Management for admins only */}
                {isAdmin && (
                  <Link href="/admin/shipments" className="dropdown-item">
                    <svg className="dropdown-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
                    </svg>
                    Shipment Management
                  </Link>
                )}

                {/* Hide settings from manufacturers and brokers */}
                {!isLimitedAccess && (
                  <>
                    <Link href="/admin/settings" className="dropdown-item">
                      <svg className="dropdown-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                      </svg>
                      Report Settings
                    </Link>
                    <Link href="/admin/commission-settings" className="dropdown-item">
                      <svg className="dropdown-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                      Commission Settings
                    </Link>
                  </>
                )}
                
                <Link href="/admin/change-password" className="dropdown-item">
                  <svg className="dropdown-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                  </svg>
                  Change Password
                </Link>
                <div className="dropdown-divider"></div>
                <button onClick={logout} className="dropdown-item dropdown-item-danger">
                  <svg className="dropdown-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
