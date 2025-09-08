// web/app/admin/kiosk/KioskAutoRefresh.jsx
'use client';

import { useEffect } from 'react';

/**
 * KioskAutoRefresh — simple client-side auto refresh for kiosk view
 * @param {number} intervalMs - refresh interval in milliseconds (default: 30s)
 */
export default function KioskAutoRefresh({ intervalMs = 30000 }) {
  useEffect(() => {
    const timer = setInterval(() => {
      window.location.reload();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs]);

  return null; // renders nothing, just runs the effect
}
