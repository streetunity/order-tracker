"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import "./MobileTabBar.css";

/**
 * MobileTabBar - thumb-reachable bottom navigation for phones.
 *
 * Renders only at mobile widths (see MobileTabBar.css); on desktop the
 * existing TopNav is the sole navigation. Mounted once inside TopNav so it
 * appears on every page TopNav does, with identical auth gating.
 *
 * Scope (Phase 1): full-access roles (admin / agent / accountant). Brokers
 * and manufacturers keep the existing icon nav for now -- their order-access
 * path differs and gets its own mobile flow in a later phase.
 */
export default function MobileTabBar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (!user) return null;

  const role = user.role;
  const isLimitedAccess = role === "MANUFACTURER" || role === "BROKER";
  if (isLimitedAccess) return null;

  const isActive = (path) => pathname === path || pathname?.startsWith(path + "/");

  const tabs = [
    {
      href: "/admin/board",
      label: "Board",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      ),
    },
    {
      href: "/admin/orders",
      label: "Orders",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      ),
    },
    {
      href: "/m/calendar",
      label: "Calendar",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      ),
    },
    {
      href: "/admin/customers",
      label: "Customers",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      ),
    },
  ];

  // Split the tabs around the centered capture button: 2 on each side.
  const leftTabs = tabs.slice(0, 2);
  const rightTabs = tabs.slice(2);

  return (
    <nav className="mobile-tab-bar" aria-label="Primary mobile navigation">
      {leftTabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`mtb-item ${isActive(t.href) ? "active" : ""}`}
        >
          <svg className="mtb-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">{t.icon}</svg>
          <span className="mtb-label">{t.label}</span>
        </Link>
      ))}

      <button
        type="button"
        className="mtb-capture"
        aria-label="Quick upload photo or video"
        onClick={() => router.push("/admin/upload")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {rightTabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`mtb-item ${isActive(t.href) ? "active" : ""}`}
        >
          <svg className="mtb-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">{t.icon}</svg>
          <span className="mtb-label">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
