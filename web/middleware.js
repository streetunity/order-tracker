import { NextResponse } from "next/server";

// Mobile-redirect temporarily disabled while diagnosing a desktop calendar
// issue. The matcher matches no real route, so this middleware runs on
// nothing and /admin, /broker, /invoicing behave exactly as before.
// Re-enable by restoring the MOBILE_ROUTES map and the real matcher.
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/__mobile_redirect_disabled__"],
};
