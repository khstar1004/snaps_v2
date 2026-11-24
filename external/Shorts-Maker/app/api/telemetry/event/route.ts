import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { createWorkflowTelemetryEvent, listWorkflowTelemetryEvents } from "@/lib/publish/publish-store";
import { WORKFLOW_EVENT_NAMES, WORKFLOW_EVENT_PAGES } from "@/lib/telemetry/schema";

export const runtime = "nodejs";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isKnownEventName(value: string): boolean {
  return (WORKFLOW_EVENT_NAMES as readonly string[]).includes(value);
}

function isKnownEventPage(value: string): boolean {
  return (WORKFLOW_EVENT_PAGES as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const limitRaw = Number.parseInt(request.nextUrl.searchParams.get("limit") || "50", 10);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
  const events = await listWorkflowTelemetryEvents(user.id, limit);
  return NextResponse.json({ ok: true, events });
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  try {
    const body = (await request.json()) as {
      name?: unknown;
      page?: unknown;
      stage?: unknown;
      status?: unknown;
      detail?: unknown;
      errorCode?: unknown;
      retryable?: unknown;
      route?: unknown;
      sessionId?: unknown;
      ts?: unknown;
    };

    const name = asString(body.name);
    const page = asString(body.page);
    if (!name || !page) {
      return toApiErrorResponse("name과 page 값이 필요합니다.", {
        status: 400,
        errorCode: "TELEMETRY_NAME_PAGE_REQUIRED",
        retryable: false,
      });
    }
    if (!isKnownEventName(name) || !isKnownEventPage(page)) {
      return toApiErrorResponse("알 수 없는 텔레메트리 name 또는 page 값입니다.", {
        status: 400,
        errorCode: "TELEMETRY_EVENT_UNKNOWN",
        retryable: false,
      });
    }

    const event = await createWorkflowTelemetryEvent({
      userId: user.id,
      name,
      page,
      stage: asString(body.stage) || undefined,
      status: asString(body.status) || undefined,
      detail: asString(body.detail) || undefined,
      errorCode: asString(body.errorCode) || undefined,
      retryable: typeof body.retryable === "boolean" ? body.retryable : undefined,
      route: asString(body.route) || undefined,
      sessionId: asString(body.sessionId) || undefined,
      ts: typeof body.ts === "number" && Number.isFinite(body.ts) ? body.ts : Date.now(),
    });

    console.info("[workflow-telemetry]", JSON.stringify(event));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toApiErrorResponse(e instanceof Error ? e.message : String(e), {
      status: 400,
      errorCode: "TELEMETRY_REQUEST_INVALID",
      retryable: false,
    });
  }
}
