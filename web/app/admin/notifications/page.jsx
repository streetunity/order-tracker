"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import "./notifications.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function NotificationsPage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      router.push("/login");
    } else {
      loadNotifications();
      loadStats();
    }
  }, [user, router, filter]);

  async function loadNotifications() {
    try {
      setLoading(true);
      setError("");
      
      const params = new URLSearchParams();
      if (filter === "unread") params.set("unreadOnly", "true");
      if (filter === "commission") params.set("category", "COMMISSION");
      if (filter === "operational") params.set("category", "OPERATIONAL");
      params.set("limit", "100");

      const res = await fetch(`${API_BASE}/notifications?${params.toString()}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const res = await fetch(`${API_BASE}/notifications/stats`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error("Failed to load stats:", e);
    }
  }

  async function markAsRead(id) {
    try {
      const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: "PATCH",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        loadNotifications();
        loadStats();
      }
    } catch (e) {
      console.error("Failed to mark as read:", e);
    }
  }

  async function markAllAsRead() {
    try {
      const res = await fetch(`${API_BASE}/notifications/read-all`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        loadNotifications();
        loadStats();
      }
    } catch (e) {
      console.error("Failed to mark all as read:", e);
    }
  }

  async function dismissNotification(id) {
    try {
      const res = await fetch(`${API_BASE}/notifications/${id}/dismiss`, {
        method: "PATCH",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        loadNotifications();
        loadStats();
      }
    } catch (e) {
      console.error("Failed to dismiss:", e);
    }
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function getPriorityColor(priority) {
    switch (priority) {
      case "CRITICAL": return "#dc2626";
      case "HIGH": return "#f59e0b";
      case "NORMAL": return "#ef4444";
      case "LOW": return "#6b7280";
      default: return "#ef4444";
    }
  }

  function getCategoryIcon(category) {
    switch (category) {
      case "COMMISSION": return "💰";
      case "OPERATIONAL": return "⚠️";
      case "ALERT": return "🔔";
      case "INFO": return "ℹ️";
      default: return "📬";
    }
  }

  if (!user) return null;

  return (
    <>
      <TopNav />
      <div className="notifications-page">
        <div className="notifications-header">
          <h1>Notifications</h1>
          {stats && (
            <div className="notification-stats">
              <div className="stat-badge">
                <span className="stat-label">Total</span>
                <span className="stat-value">{stats.total}</span>
              </div>
              <div className="stat-badge unread">
                <span className="stat-label">Unread</span>
                <span className="stat-value">{stats.unread}</span>
              </div>
            </div>
          )}
        </div>

        <div className="notifications-toolbar">
          <div className="filter-buttons">
            <button
              className={`filter-btn ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              className={`filter-btn ${filter === "unread" ? "active" : ""}`}
              onClick={() => setFilter("unread")}
            >
              Unread {stats?.unread > 0 && `(${stats.unread})`}
            </button>
            <button
              className={`filter-btn ${filter === "commission" ? "active" : ""}`}
              onClick={() => setFilter("commission")}
            >
              💰 Commissions
            </button>
            <button
              className={`filter-btn ${filter === "operational" ? "active" : ""}`}
              onClick={() => setFilter("operational")}
            >
              ⚠️ Operational
            </button>
          </div>

          {stats?.unread > 0 && (
            <button className="mark-all-read-btn" onClick={markAllAsRead}>
              Mark all as read
            </button>
          )}
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {loading ? (
          <div className="loading-state">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h2>No notifications</h2>
            <p>
              {filter === "unread" && "You're all caught up!"}
              {filter === "commission" && "No commission notifications yet"}
              {filter === "operational" && "No operational alerts"}
              {filter === "all" && "You don't have any notifications yet"}
            </p>
          </div>
        ) : (
          <div className="notifications-list">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={`notification-card ${!notif.isRead ? "unread" : ""} priority-${notif.priority.toLowerCase()}`}
                onClick={() => !notif.isRead && markAsRead(notif.id)}
              >
                <div className="notification-indicator" style={{ backgroundColor: getPriorityColor(notif.priority) }}></div>
                
                <div className="notification-icon">
                  {getCategoryIcon(notif.category)}
                </div>

                <div className="notification-content">
                  <div className="notification-header-row">
                    <h3 className="notification-title">{notif.title}</h3>
                    <div className="notification-meta">
                      <span className="notification-time">{formatDate(notif.createdAt)}</span>
                      {!notif.isRead && <span className="unread-dot"></span>}
                    </div>
                  </div>

                  <p className="notification-message">{notif.message}</p>

                  {notif.metadata && (
                    <div className="notification-metadata">
                      {notif.metadata.customerName && (
                        <span className="metadata-tag">👤 {notif.metadata.customerName}</span>
                      )}
                      {notif.metadata.orderPoNumber && (
                        <span className="metadata-tag">📦 {notif.metadata.orderPoNumber}</span>
                      )}
                      {notif.metadata.daysInStage && (
                        <span className="metadata-tag">⏱️ {notif.metadata.daysInStage} days</span>
                      )}
                      {notif.metadata.stage && (
                        <span className="metadata-tag">📍 {notif.metadata.stage}</span>
                      )}
                    </div>
                  )}

                  <div className="notification-actions">
                    {notif.relatedOrderId && (
                      <Link
                        href={`/admin/orders/${notif.relatedOrderId}`}
                        className="action-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View Order →
                      </Link>
                    )}
                    {!notif.isDismissed && (
                      <button
                        className="dismiss-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissNotification(notif.id);
                        }}
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
