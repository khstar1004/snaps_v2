import { NextRequest, NextResponse } from "next/server";
import { getAdminOverviewSnapshot } from "@/lib/auth/admin";
import { isAdminSessionUser, requireAuthenticatedSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = requireAuthenticatedSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  if (!isAdminSessionUser(user)) return toForbiddenApiResponse("관리자만 전체 대시보드를 볼 수 있습니다.");

  return NextResponse.json({
    ok: true,
    overview: await getAdminOverviewSnapshot(),
  });
}
