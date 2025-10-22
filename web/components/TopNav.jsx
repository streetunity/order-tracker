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

  useEffect(() => {
    if (user) {
      loadNotificationCount();
      loadYearlyTotal();
    }
  }, [user]);

  // Close dropdown when clicking outside
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
      const res = await fetch("/api/notifications/count", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setNotificationCount(data.count || 0);
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
      <div className="nav-left">
        <div className="logo">
          <div className="logo-icon">
            <img src="/smt-logo.png" alt="SMT Logo" />
          </div>
          Order Tracker
        </div>
        <div className="nav-links">
          <Link
            href="/admin/board"
            className={`nav-link ${isActive("/admin/board") ? "active" : ""}`}
          >
            Board
          </Link>
          <Link
            href="/admin/customers"
            className={`nav-link ${isActive("/admin/customers") ? "active" : ""}`}
          >
            Customers
          </Link>
          <Link
            href="/admin/orders"
            className={`nav-link ${isActive("/admin/orders") ? "active" : ""}`}
          >
            Orders
          </Link>
          <Link
            href="/admin/reports"
            className={`nav-link ${isActive("/admin/reports") ? "active" : ""}`}
          >
            Reports
          </Link>
          <Link
            href="/admin/commissions"
            className={`nav-link ${isActive("/admin/commissions") ? "active" : ""}`}
          >
            Commissions
          </Link>
          {isAdmin && (
            <>
              <Link
                href="/admin/users"
                className={`nav-link ${isActive("/admin/users") ? "active" : ""}`}
              >
                Manage Users
              </Link>
              <Link
                href="/history"
                className={`nav-link ${isActive("/history") ? "active" : ""}`}
              >
                Audit
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="nav-right">
        {/* Sales Total */}
        {yearlyTotal && (
          <div className="sales-total">
            {new Date().getFullYear()} Total: {yearlyTotal.formatted} Sales
          </div>
        )}

        {/* Notification Bell */}
        <Link href="/admin/notifications" className="notification-bell">
          <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            ></path>
          </svg>
          {notificationCount > 0 && (
            <div className="notification-badge">{notificationCount}</div>
          )}
        </Link>

        {/* User Menu */}
        <div
          className="user-menu"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          ref={dropdownRef}
        >
          <div className="user-avatar">{getInitials(user.name)}</div>
          <div className="user-info">
            <div className="user-name">{user.name}</div>
            <div className="user-role">{user.role}</div>
          </div>
          <svg
            className="icon-sm dropdown-arrow"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            style={{
              transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 9l-7 7-7-7"
            ></path>
          </svg>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <div className="user-dropdown">
              <Link href="/admin/profile" className="dropdown-item">
                <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  ></path>
                </svg>
                My Profile
              </Link>
              <Link href="/admin/change-password" className="dropdown-item">
                <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  ></path>
                </svg>
                Change Password
              </Link>
              <div className="dropdown-divider"></div>
              <button onClick={logout} className="dropdown-item logout-item">
                <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  ></path>
                </svg>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
