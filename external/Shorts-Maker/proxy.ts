import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isLocalAuthBypassEnabled } from "@/lib/auth/local-bypass";
import {
  getPersonalModeRouteDisposition,
  getPersonalModeSessionSnapshot,
  isPersonalModeEnabled,
  syncPersonalModeCookies,
} from "@/lib/auth/personal-mode";
import { buildValidatedRequestHeaders } from "@/lib/auth/request-headers";
import { getValidatedSessionSnapshot, syncValidatedSessionCookies } from "@/lib/auth/session";

function isStaticPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/sfx/") ||
    pathname.startsWith("/bgm/")
  );
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/api/auth/register") ||
    pathname.startsWith("/api/auth/session") ||
    pathname.startsWith("/api/auth/codex") ||
    pathname.startsWith("/api/auth/google") ||
    pathname.startsWith("/api/auth/youtube") ||
    pathname.startsWith("/api/local-storage/")
  );
}

function getDefaultAuthenticatedPath(snapshot: NonNullable<Awaited<ReturnType<typeof getValidatedSessionSnapshot>>>): string {
  if (snapshot.authUser.role === "admin" && !snapshot.user.isActingAs) {
    return "/admin/overview";
  }
  return "/home";
}

function isAdminWorkspaceRequiredPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/home" ||
    pathname.startsWith("/publish") ||
    pathname.startsWith("/trash") ||
    pathname.startsWith("/shorts-json-studio") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/layout-studio") ||
    pathname.startsWith("/channel-categories")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isStaticPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (isPersonalModeEnabled()) {
    const disposition = getPersonalModeRouteDisposition(pathname);
    if (disposition === "redirect_home") {
      return NextResponse.redirect(new URL("/home", request.nextUrl.origin));
    }
    if (disposition === "not_found") {
      return NextResponse.json(
        { ok: false, error: "개인용 모드에서는 제공하지 않는 기능입니다.", errorCode: "NOT_FOUND", retryable: false },
        { status: 404 }
      );
    }

    try {
      const snapshot = await getPersonalModeSessionSnapshot();
      const requestHeaders = buildValidatedRequestHeaders(request.headers, snapshot);
      const response = NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
      syncPersonalModeCookies(response, request, snapshot);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "개인 작업공간을 준비하지 못했습니다.";
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { ok: false, error: message, errorCode: "PERSONAL_OWNER_SETUP_REQUIRED", retryable: false },
          { status: 503 }
        );
      }
      return new NextResponse(
        `개인 작업공간을 준비하지 못했습니다. ${message}`,
        { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }
  }

  if (isLocalAuthBypassEnabled()) {
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/home", request.nextUrl.origin));
    }
    return NextResponse.next();
  }

  const isApiRoute = pathname.startsWith("/api/");
  const snapshot = await getValidatedSessionSnapshot(request);
  const requestHeaders = buildValidatedRequestHeaders(request.headers, snapshot);

  if (isPublicPath(pathname)) {
    const response =
      snapshot && pathname === "/login"
        ? NextResponse.redirect(new URL(getDefaultAuthenticatedPath(snapshot), request.nextUrl.origin))
        : NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });
    syncValidatedSessionCookies(response, request, snapshot);
    return response;
  }

  if (!snapshot) {
    if (isApiRoute) {
      const response = NextResponse.json(
        { ok: false, error: "로그인이 필요합니다.", errorCode: "AUTH_REQUIRED", retryable: false },
        { status: 401 }
      );
      syncValidatedSessionCookies(response, request, null);
      return response;
    }
    const loginUrl = new URL("/login", request.nextUrl.origin);
    const nextPath = pathname === "/" ? "/home" : `${pathname}${search}`;
    loginUrl.searchParams.set("next", nextPath);
    const response = NextResponse.redirect(loginUrl);
    syncValidatedSessionCookies(response, request, null);
    return response;
  }

  if ((pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) && snapshot.authUser.role !== "admin") {
    if (isApiRoute) {
      const response = NextResponse.json(
        { ok: false, error: "권한이 없습니다.", errorCode: "AUTH_FORBIDDEN", retryable: false },
        { status: 403 }
      );
      syncValidatedSessionCookies(response, request, snapshot);
      return response;
    }
    const response = NextResponse.redirect(new URL("/home", request.nextUrl.origin));
    syncValidatedSessionCookies(response, request, snapshot);
    return response;
  }

  if (snapshot.authUser.role === "admin" && !snapshot.user.isActingAs && isAdminWorkspaceRequiredPath(pathname)) {
    const response = NextResponse.redirect(new URL("/admin/overview", request.nextUrl.origin));
    syncValidatedSessionCookies(response, request, snapshot);
    return response;
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  syncValidatedSessionCookies(response, request, snapshot);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
