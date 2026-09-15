import { auth } from "@/auth";

const PUBLIC_ROUTES = ["/signin", "/signup"];

export const proxy = auth((req) => {
  const isPublicRoute = PUBLIC_ROUTES.includes(req.nextUrl.pathname);
  if (!req.auth && !isPublicRoute) {
    return Response.redirect(new URL("/signin", req.nextUrl.origin));
  }
});

// icon.svg and apple-icon excluded alongside favicon.ico - without it, a
// signed-out visitor got redirected to /signin instead of served the icon.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon).*)"],
};
