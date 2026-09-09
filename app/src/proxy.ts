import { auth } from "@/auth";

const PUBLIC_ROUTES = ["/signin", "/signup"];

export const proxy = auth((req) => {
  const isPublicRoute = PUBLIC_ROUTES.includes(req.nextUrl.pathname);
  if (!req.auth && !isPublicRoute) {
    return Response.redirect(new URL("/signin", req.nextUrl.origin));
  }
});

// icon.svg and apple-icon added alongside the pre-existing favicon.ico
// exclusion - without it, a signed-out visitor (including the /signin page
// itself) got a 302-to-/signin instead of the tab/home-screen icon (found
// while wiring up the new tally-mark icons, 2026-09-09).
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon).*)"],
};
