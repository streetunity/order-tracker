"use client";

/**
 * Invoicing Loading State Component
 * Provides consistent loading UI across invoicing pages
 */
export default function InvoicingLoadingState({ message = "Loading..." }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "60px 20px",
      color: "rgba(255, 255, 255, 0.5)"
    }}>
      <div style={{
        width: "40px",
        height: "40px",
        border: "3px solid rgba(255, 255, 255, 0.1)",
        borderTopColor: "#dc2626",
        borderRadius: "50%",
        animation: "spin 1s linear infinite",
        marginBottom: "16px"
      }} />
      <p style={{ margin: 0, fontSize: "14px" }}>{message}</p>
      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Invoicing Empty State Component
 * Provides consistent empty state UI
 */
export function InvoicingEmptyState({
  icon = "📋",
  title = "No data found",
  message = "",
  actionLabel = null,
  onAction = null
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "60px 20px",
      textAlign: "center"
    }}>
      <div style={{ fontSize: "48px", marginBottom: "16px", opacity: 0.5 }}>
        {icon}
      </div>
      <h3 style={{
        margin: "0 0 8px 0",
        fontSize: "18px",
        fontWeight: "600",
        color: "rgba(255, 255, 255, 0.9)"
      }}>
        {title}
      </h3>
      {message && (
        <p style={{
          margin: "0 0 16px 0",
          fontSize: "14px",
          color: "rgba(255, 255, 255, 0.5)",
          maxWidth: "400px"
        }}>
          {message}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            padding: "10px 20px",
            background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
            border: "none",
            borderRadius: "8px",
            color: "white",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer"
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Invoicing Error State Component
 * Provides consistent error display
 */
export function InvoicingErrorState({
  error = "An error occurred",
  onRetry = null
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "60px 20px",
      textAlign: "center"
    }}>
      <div style={{
        width: "60px",
        height: "60px",
        background: "rgba(239, 68, 68, 0.1)",
        border: "1px solid rgba(239, 68, 68, 0.3)",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: "16px"
      }}>
        <span style={{ fontSize: "24px" }}>⚠️</span>
      </div>
      <h3 style={{
        margin: "0 0 8px 0",
        fontSize: "18px",
        fontWeight: "600",
        color: "#ef4444"
      }}>
        Something went wrong
      </h3>
      <p style={{
        margin: "0 0 16px 0",
        fontSize: "14px",
        color: "rgba(255, 255, 255, 0.7)",
        maxWidth: "400px"
      }}>
        {error}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: "10px 20px",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "8px",
            color: "rgba(255, 255, 255, 0.9)",
            fontSize: "14px",
            cursor: "pointer"
          }}
        >
          Try Again
        </button>
      )}
    </div>
  );
}
