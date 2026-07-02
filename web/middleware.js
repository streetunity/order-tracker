import { NextResponse } from "next/server";

// Desktop path -> mobile path. Add an entry here each time a mobile
// version of a page ships; unlisted paths always fall through untouched,
// so the desktop app is never affected.
const MOBILE_ROUTES = {
  "/admin/calendar": "/m/calendar",
};

// Phones only. iPad and other tablets intentionally keep the desktop UI.
const MOBILE_UA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i;

export function middleware(request) {
  const { pathname } = request.nextUrl;

  const target = MOBILE_ROUTES[pathname];
  if (!target) return NextResponse.next();

  // Escape hatch: ?desktop=1 forces the desktop layout on a phone.
  if (request.nextUrl.searchParams.get("desktop") === "1") return NextResponse.next();

  const ua = request.headers.get("user-agent") || "";
  if (!MOBILE_UA.test(ua)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.redirect(url);
}

export const config = {
  // Only the areas that will have mobile versions. Cheap and scoped.
  matcher: ["/admin/:path*", "/broker/:path*", "/invoicing/:path*"],
};
