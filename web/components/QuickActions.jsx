"use client";

import Link from "next/link";
import "./QuickActions.css";

export default function QuickActions() {
  return (
    <div className="quick-actions">
      <Link href="/admin/customers/new" className="action-btn primary">
        <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
          ></path>
        </svg>
        Add Customer
      </Link>
      <Link href="/admin/orders/new" className="action-btn">
        <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 4v16m8-8H4"
          ></path>
        </svg>
        Add Order
      </Link>
    </div>
  );
}
