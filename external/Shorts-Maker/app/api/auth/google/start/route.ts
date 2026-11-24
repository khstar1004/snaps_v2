import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_NEXT_PATH = "/shorts-json-studio";

export async function GET(request: NextRequest) {
  const nextPathRaw = request.nextUrl.searchParams.get("next") || DEFAULT_NEXT_PATH;
  const nextPath = nextPathRaw.startsWith("/") ? nextPathRaw : DEFAULT_NEXT_PATH;
  return NextResponse.redirect(new URL(nextPath, request.nextUrl.origin));
}
