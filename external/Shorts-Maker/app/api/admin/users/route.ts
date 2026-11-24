import { NextRequest, NextResponse } from "next/server";
import { recordAuditLogSafely } from "@/lib/audit/server";
import { listAdminUserSummaries } from "@/lib/auth/admin";
import { isAdminSessionUser, requireAuthenticatedSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { hashPassword } from "@/lib/auth/password";
import { createAuthUser } from "@/lib/auth/store";
import { toApiErrorResponse } from "@/lib/publish/api-error";

export const runtime = "nodejs";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  const user = requireAuthenticatedSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  if (!isAdminSessionUser(user)) return toForbiddenApiResponse("관리자만 사용자 목록을 볼 수 있습니다.");

  return NextResponse.json({
    ok: true,
    users: await listAdminUserSummaries(),
  });
}

export async function POST(request: NextRequest) {
  const user = requireAuthenticatedSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  if (!isAdminSessionUser(user)) return toForbiddenApiResponse("관리자만 사용자를 만들 수 있습니다.");

  try {
    const body = await request.json().catch(() => ({}));
    const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const loginId = asString(row.loginId);
    const displayName = asString(row.displayName) || loginId;
    const password = asString(row.password);
    const role = asString(row.role) === "admin" ? "admin" : "member";

    if (!loginId || !password) {
      return toApiErrorResponse("아이디와 비밀번호를 입력해 주세요.", {
        status: 400,
        errorCode: "AUTH_INVALID_INPUT",
        retryable: false,
      });
    }
    if (password.length < 4) {
      return toApiErrorResponse("비밀번호는 4자 이상이어야 합니다.", {
        status: 400,
        errorCode: "AUTH_PASSWORD_TOO_SHORT",
        retryable: false,
      });
    }

    const created = await createAuthUser({
      loginId,
      displayName,
      passwordHash: await hashPassword(password),
      role,
      isActive: true,
    });
    await recordAuditLogSafely({
      user,
      request,
      action: "admin.user_created",
      resourceType: "user",
      resourceId: created.id,
      resourceLabel: created.displayName,
      detail: `${created.loginId} 계정을 생성했습니다.`,
      metadata: {
        createdLoginId: created.loginId,
        createdRole: created.role,
      },
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: created.id,
        loginId: created.loginId,
        displayName: created.displayName,
        role: created.role,
      },
    });
  } catch (error) {
    return toApiErrorResponse(error instanceof Error ? error.message : String(error), {
      status: 400,
      errorCode: "ADMIN_USER_CREATE_FAILED",
      retryable: false,
    });
  }
}
