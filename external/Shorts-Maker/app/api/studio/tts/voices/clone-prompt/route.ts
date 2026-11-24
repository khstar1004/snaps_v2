import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  return NextResponse.json(
    { ok: false, error: "Voice clone prompt generation is no longer supported." },
    { status: 410 }
  );
}
