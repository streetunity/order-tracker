"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUnsavedChanges } from "@/contexts/UnsavedChangesContext";
import LeaveWarningModal from "./LeaveWarningModal";
import "./TopNav.css";

export default function InvoicingNav() {
  const { user, logout, isAdmin } = useAuth();
  const router = useRouter();
  const { hasUnsavedChanges, navigateWithWarning } = useUnsavedChanges();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const pathname = usePathname();

  const handleNavClick = (e, href) => {
    if (hasUnsavedChanges) { e.preventDefault(); navigateWithWarning(href, router); }
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function getInitials(name) {
    if (!name) return "?";
    const parts = name.split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }

  const isActive = (path) => {
    if (path === "/invoicing") return pathname === "/invoicing";
    return pathname.startsWith(path);
  };

  if (!user) return null;

  return (
    <>
      <LeaveWarningModal />
      <nav className="top-nav">
        <div className="nav-container">
          <div className="nav-left">
            <div className="logo-section">
              <div className="logo-icon"><img src="/smt-logo.png" alt="SMT Logo" /></div>
              <span className="logo-text">Invoicing</span>
            </div>
            <div className="nav-divider"></div>
            <div className="nav-links">
              <Link href="/invoicing" className={`nav-link ${pathname === "/invoicing" ? "active" : ""}`} onClick={(e) => handleNavClick(e, "/invoicing")}>
                <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                Dashboard
              </Link>
              <Link href="/invoicing/leads" className={`nav-link ${isActive("/invoicing/leads") ? "active" : ""}`} onClick={(e) => handleNavClick(e, "/invoicing/leads")}>
                <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                Leads
              </Link>
              <Link href="/invoicing/customers" className={`nav-link ${isActive("/invoicing/customers") ? "active" : ""}`} onClick={(e) => handleNavClick(e, "/invoicing/customers")}>
                <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                Customers
              </Link>
              <Link href="/invoicing/estimates" className={`nav-link ${isActive("/invoicing/estimates") ? "active" : ""}`} onClick={(e) => handleNavClick(e, "/invoicing/estimates")}>
                <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Estimates
              </Link>
              <Link href="/invoicing/invoices" className={`nav-link ${isActive("/invoicing/invoices") ? "active" : ""}`} onClick={(e) => handleNavClick(e, "/invoicing/invoices")}>
                <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" /></svg>
                Invoices
              </Link>
              <Link href="/invoicing/products" className={`nav-link ${isActive("/invoicing/products") ? "active" : ""}`} onClick={(e) => handleNavClick(e, "/invoicing/products")}>
                <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                Products
              </Link>
              <Link href="/invoicing/reports" className={`nav-link ${isActive("/invoicing/reports") ? "active" : ""}`} onClick={(e) => handleNavClick(e, "/invoicing/reports")}>
                <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                Reports
              </Link>
              <Link href="/admin/calendar?from=invoicing" className={`nav-link ${isActive("/admin/calendar") ? "active" : ""}`} onClick={(e) => handleNavClick(e, "/admin/calendar?from=invoicing")}>
                <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Calendar
              </Link>
            </div>
          </div>

          <div className="nav-right">
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

                  <Link href="/admin/board" className="dropdown-item" onClick={(e) => handleNavClick(e, "/admin/board")}>
                    <svg className="dropdown-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
                    Order Tracker
                  </Link>

                  <div className="dropdown-divider"></div>

                  <Link href="/admin/profile?from=invoicing" className="dropdown-item" onClick={(e) => handleNavClick(e, "/admin/profile?from=invoicing")}>
                    <svg className="dropdown-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                    My Profile
                  </Link>

                  {isAdmin && (
                    <>
                      <div className="dropdown-divider"></div>
                      <Link href="/admin/users" className="dropdown-item" onClick={(e) => handleNavClick(e, "/admin/users")}>
                        <svg className="dropdown-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                        Users
                      </Link>
                      <Link href="/history?from=invoicing" className="dropdown-item" onClick={(e) => handleNavClick(e, "/history?from=invoicing")}>
                        <svg className="dropdown-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Audit Log
                      </Link>
                    </>
                  )}

                  <div className="dropdown-divider"></div>

                  <Link href="/invoicing/settings" className="dropdown-item" onClick={(e) => handleNavClick(e, "/invoicing/settings")}>
                    <svg className="dropdown-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    Settings
                  </Link>

                  <div className="dropdown-divider"></div>
                  <button onClick={logout} className="dropdown-item dropdown-item-danger">
                    <svg className="dropdown-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
