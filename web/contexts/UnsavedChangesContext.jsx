"use client";

import { createContext, useContext, useState, useCallback } from "react";

const UnsavedChangesContext = createContext({
  hasUnsavedChanges: false,
  setHasUnsavedChanges: () => {},
  showLeaveWarning: false,
  setShowLeaveWarning: () => {},
  pendingNavigation: null,
  setPendingNavigation: () => {},
  confirmLeave: () => {},
  cancelLeave: () => {},
  navigateWithWarning: () => {},
});

export function UnsavedChangesProvider({ children }) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [onConfirmLeave, setOnConfirmLeave] = useState(null);

  const navigateWithWarning = useCallback((url, router) => {
    if (hasUnsavedChanges) {
      setPendingNavigation(url);
      setOnConfirmLeave(() => () => {
        setHasUnsavedChanges(false);
        setShowLeaveWarning(false);
        router.push(url);
      });
      setShowLeaveWarning(true);
      return false;
    }
    router.push(url);
    return true;
  }, [hasUnsavedChanges]);

  const confirmLeave = useCallback(() => {
    if (onConfirmLeave) {
      onConfirmLeave();
    }
    setShowLeaveWarning(false);
    setPendingNavigation(null);
    setOnConfirmLeave(null);
  }, [onConfirmLeave]);

  const cancelLeave = useCallback(() => {
    setShowLeaveWarning(false);
    setPendingNavigation(null);
    setOnConfirmLeave(null);
  }, []);

  return (
    <UnsavedChangesContext.Provider
      value={{
        hasUnsavedChanges,
        setHasUnsavedChanges,
        showLeaveWarning,
        setShowLeaveWarning,
        pendingNavigation,
        setPendingNavigation,
        confirmLeave,
        cancelLeave,
        navigateWithWarning,
      }}
    >
      {children}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  return useContext(UnsavedChangesContext);
}
