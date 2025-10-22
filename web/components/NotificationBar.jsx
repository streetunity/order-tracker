"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import "./NotificationBar.css";

export default function NotificationBar() {
  const { getAuthHeaders } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetchNotifications();
    // Poll every 30 seconds for new notifications
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications/unread", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    }
  }

  async function markAsRead(id) {
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        headers: getAuthHeaders(),
      });
      setNotifications(notifications.filter((n) => n.id !== id));
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  }

  if (notifications.length === 0) return null;

  const displayedNotifications = showAll ? notifications : notifications.slice(0, 3);

  return (
    <div className="notification-bar">
      {displayedNotifications.map((notification) => (
        <div key={notification.id} className="notification-item">
          <div className="notification-content">
            <div
              className={`notification-icon ${
                notification.type === "COMMISSION_APPROVED"
                  ? "approved"
                  : notification.type === "COMMISSION_PENDING"
                  ? "pending"
                  : "warning"
              }`}
            >
              {notification.type === "COMMISSION_APPROVED"
                ? "✓"
                : notification.type === "COMMISSION_PENDING"
                ? "⏰"
                : "⚠"}
            </div>
            <div className="notification-text">
              <div className="notification-title">{notification.title}</div>
              <div className="notification-message">{notification.message}</div>
            </div>
          </div>
          <div className="notification-actions">
            {notification.relatedId && (
              <Link
                href={
                  notification.type.includes("COMMISSION")
                    ? `/admin/commissions/${notification.relatedId}`
                    : `/admin/orders/${notification.relatedId}`
                }
                className="notification-btn"
              >
                {notification.type === "COMMISSION_PENDING" ? "Review" : "View Details"}
              </Link>
            )}
            <button
              onClick={() => markAsRead(notification.id)}
              className="notification-dismiss"
              aria-label="Dismiss notification"
            >
              <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                ></path>
              </svg>
            </button>
          </div>
        </div>
      ))}

      {notifications.length > 3 && (
        <div className="notification-footer">
          <button onClick={() => setShowAll(!showAll)}>
            {showAll
              ? "Show less"
              : `Show all notifications (${notifications.length}) →`}
          </button>
        </div>
      )}
    </div>
  );
}
