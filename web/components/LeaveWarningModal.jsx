"use client";

import { useUnsavedChanges } from "@/contexts/UnsavedChangesContext";
import "../app/invoicing/modal.css";

export default function LeaveWarningModal() {
  const { showLeaveWarning, confirmLeave, cancelLeave } = useUnsavedChanges();

  if (!showLeaveWarning) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Unsaved Changes</h2>
        <p className="modal-confirm-text">
          You have unsaved changes. Are you sure you want to leave this page? Your changes will be lost.
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="modal-btn cancel"
            onClick={cancelLeave}
          >
            Stay on Page
          </button>
          <button type="button" className="modal-btn danger" onClick={confirmLeave}>
            Leave Page
          </button>
        </div>
      </div>
    </div>
  );
}
