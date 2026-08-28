import { auth } from "@/auth";

const PUBLIC_ROUTES = ["/signin", "/signup"];

export const proxy = auth((req) => {
  const isPublicRoute = PUBLIC_ROUTES.includes(req.nextUrl.pathname);
  if (!req.auth && !isPublicRoute) {
    return Response.redirect(new URL("/signin", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
