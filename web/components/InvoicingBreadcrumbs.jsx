"use client";

import Link from "next/link";

/**
 * Invoicing Breadcrumbs Component
 * Provides consistent navigation across invoicing pages
 *
 * @param {Array} items - Array of {label, href} objects. Last item is current page (no link)
 */
export default function InvoicingBreadcrumbs({ items = [] }) {
  const allItems = [
    { label: "Invoicing", href: "/invoicing" },
    ...items
  ];

  return (
    <nav style={{
      marginBottom: "16px",
      fontSize: "13px"
    }}>
      {allItems.map((item, index) => {
        const isLast = index === allItems.length - 1;

        return (
          <span key={index}>
            {isLast ? (
              <span style={{ color: "rgba(255, 255, 255, 0.9)" }}>
                {item.label}
              </span>
            ) : (
              <>
                <Link
                  href={item.href}
                  style={{
                    color: "rgba(255, 255, 255, 0.5)",
                    textDecoration: "none",
                    transition: "color 0.2s"
                  }}
                  onMouseEnter={(e) => e.target.style.color = "#dc2626"}
                  onMouseLeave={(e) => e.target.style.color = "rgba(255, 255, 255, 0.5)"}
                >
                  {item.label}
                </Link>
                <span style={{
                  margin: "0 8px",
                  color: "rgba(255, 255, 255, 0.3)"
                }}>
                  /
                </span>
              </>
            )}
          </span>
        );
      })}
    </nav>
  );
}
