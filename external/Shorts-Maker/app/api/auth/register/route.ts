import { NextRequest } from "next/server";
import { toApiErrorResponse } from "@/lib/publish/api-error";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  void request;
  return toApiErrorResponse("로컬 모드에서는 앱 회원가입이 필요하지 않습니다.", {
    status: 400,
    errorCode: "AUTH_REGISTER_NOT_REQUIRED",
    retryable: false,
  });
}
