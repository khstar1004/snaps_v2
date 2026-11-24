import { NextRequest, NextResponse } from "next/server";
import { canEditCategory, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { resolveCodexAccessTokenFromRequest } from "@/lib/auth/codex-server";
import { readJsonBody } from "@/lib/network/request-body";
import { toStudioFailureResponse } from "@/lib/studio/error-response";
import { planMissingSlideSfx } from "@/lib/studio/sfx-query-planner";
import { parsePrepareRequest } from "@/lib/studio/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;
  try {
    const body = await readJsonBody(request);
    const bestEffortSfxPlan = Boolean(
      body && typeof body === "object" && (body as Record<string, unknown>).bestEffortSfxPlan === true
    );
    const payload = parsePrepareRequest(body);
    const targetSlideIndexes = Array.isArray(
      body && typeof body === "object" ? (body as Record<string, unknown>).targetSlideIndexes : undefined
    )
      ? Array.from(
          new Set(
            ((body as Record<string, unknown>).targetSlideIndexes as unknown[])
              .map((value) => Number(value))
              .filter(
                (value) => Number.isInteger(value) && value >= 0 && value < payload.slides.length
              )
          )
        ).slice(0, payload.slides.length)
      : undefined;
    const scope = await getCategoryAccessScope({
      actorRole: authUser.role === "admin" ? "admin" : "member",
      workspaceUserId: user.id,
    });
    if (!canEditCategory(scope, payload.publishCategory)) {
      return toForbiddenApiResponse("편집 권한이 있는 고객(category)만 제작할 수 있습니다.");
    }
    const codexAccessToken = await resolveCodexAccessTokenFromRequest(request);
    const plannedSfx = await planMissingSlideSfx(payload, {
      codexAccessToken,
      bestEffort: bestEffortSfxPlan,
      targetSlideIndexes,
    });
    return NextResponse.json({
      ok: true,
      warnings: plannedSfx.warnings,
      slides: plannedSfx.payload.slides.map((slide) => ({
        sfxPlan: slide.sfxPlan,
        sfxCue: slide.sfxCue,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toStudioFailureResponse(message, "INVALID_SFX_PLAN_INPUT", "SFX_PLAN_FAILED");
  }
}
