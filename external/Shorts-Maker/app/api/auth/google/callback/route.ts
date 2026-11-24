import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_NEXT_PATH = "/shorts-json-studio";

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL(DEFAULT_NEXT_PATH, request.nextUrl.origin));
}
