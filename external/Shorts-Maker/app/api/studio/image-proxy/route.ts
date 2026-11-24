import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import {
  cancelResponseBodyQuietly,
  fetchWithRedirectValidation,
  readResponseBodyWithinLimit,
} from "@/lib/network/request-guard";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import {
  buildStudioImageProxyUpstreamHeaders,
  normalizeStudioImageProxyUpstreamUrl,
  STUDIO_IMAGE_PROXY_MAX_BYTES,
  STUDIO_IMAGE_PROXY_REDIRECT_LIMIT,
} from "@/lib/studio/image-proxy-shared";

export const runtime = "nodejs";

function toImageProxyLogPrefix(target: URL): string {
  return `[studio-image-proxy] host=${target.hostname}${target.pathname}`;
}

function hasKnownImageSignature(bytes: Uint8Array): boolean {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return true;
  }
  if (bytes.length >= 6) {
    const gif = String.fromCharCode(...bytes.slice(0, 6));
    if (gif === "GIF87a" || gif === "GIF89a") return true;
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return true;
  }
  if (bytes.length >= 2 && String.fromCharCode(bytes[0], bytes[1]) === "BM") return true;
  if (bytes.length >= 12) {
    const boxType = String.fromCharCode(...bytes.slice(4, 12));
    if (boxType === "ftypavif" || boxType === "ftypavis") return true;
  }
  return false;
}

function looksLikeHtmlPayload(bytes: Uint8Array): boolean {
  const prefix = Buffer.from(bytes.slice(0, 128))
    .toString("utf8")
    .trimStart()
    .toLowerCase();
  return (
    prefix.startsWith("<!doctype html") ||
    prefix.startsWith("<html") ||
    prefix.startsWith("<head") ||
    prefix.startsWith("<body") ||
    prefix.startsWith("{\"error\"") ||
    prefix.startsWith("{\"message\"")
  );
}

function isInvalidImagePayload(contentType: string, bytes: Uint8Array): boolean {
  const normalizedContentType = String(contentType || "").split(";")[0]?.trim().toLowerCase() || "";
  if (hasKnownImageSignature(bytes)) return false;
  return looksLikeHtmlPayload(bytes);
}

function normalizeImageContentType(contentType: string): string {
  return String(contentType || "").split(";")[0]?.trim().toLowerCase() || "";
}

export async function handleStudioImageProxyRequest(
  request: NextRequest,
  deps: { fetchImpl?: typeof fetch } = {}
) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const rawUrl = request.nextUrl.searchParams.get("url") || "";
  if (!rawUrl) {
    return toApiErrorResponse("url 파라미터가 필요합니다.", {
      status: 400,
      errorCode: "IMAGE_PROXY_URL_REQUIRED",
      retryable: false,
    });
  }

  let target: URL;
  try {
    target = new URL(normalizeStudioImageProxyUpstreamUrl(rawUrl) || rawUrl);
  } catch {
    return toApiErrorResponse("유효하지 않은 URL입니다.", {
      status: 400,
      errorCode: "IMAGE_PROXY_URL_INVALID",
      retryable: false,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const upstream = await fetchWithRedirectValidation(target, {
      signal: controller.signal,
      redirectLimit: STUDIO_IMAGE_PROXY_REDIRECT_LIMIT,
      fetchImpl: deps.fetchImpl,
      getHeadersForUrl: buildStudioImageProxyUpstreamHeaders,
    });
    if (!upstream.ok) {
      console.warn(`${toImageProxyLogPrefix(target)} upstream_status=${upstream.status}`);
      await cancelResponseBodyQuietly(upstream, new Error("upstream response discarded"));
      return toApiErrorResponse("원본 이미지 조회에 실패했습니다.", {
        status: 502,
        errorCode: "IMAGE_PROXY_UPSTREAM_FAILED",
        retryable: true,
      });
    }
    const contentType = upstream.headers.get("content-type") || "";
    const normalizedContentType = normalizeImageContentType(contentType);
    if (!normalizedContentType.startsWith("image/")) {
      await cancelResponseBodyQuietly(upstream, new Error("non-image response discarded"));
      return toApiErrorResponse("이미지 콘텐츠가 아닙니다.", {
        status: 415,
        errorCode: "IMAGE_PROXY_NOT_IMAGE_CONTENT",
        retryable: false,
      });
    }
    if (normalizedContentType === "image/svg+xml") {
      await cancelResponseBodyQuietly(upstream, new Error("svg image response discarded"));
      return toApiErrorResponse("SVG 이미지는 보안상 프록시할 수 없습니다.", {
        status: 415,
        errorCode: "IMAGE_PROXY_UNSAFE_IMAGE_TYPE",
        retryable: false,
      });
    }
    const bytes = await readResponseBodyWithinLimit(upstream, STUDIO_IMAGE_PROXY_MAX_BYTES);
    if (isInvalidImagePayload(contentType, bytes)) {
      console.warn(`${toImageProxyLogPrefix(target)} invalid_image_payload content_type=${contentType}`);
      return toApiErrorResponse("원본 이미지 응답이 손상되었거나 차단되었습니다.", {
        status: 502,
        errorCode: "IMAGE_PROXY_INVALID_IMAGE_BYTES",
        retryable: true,
      });
    }
    const responseBody = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(responseBody).set(bytes);
    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`${toImageProxyLogPrefix(target)} request_failed message=${message}`);
    if (message.includes("blocked")) {
      return toApiErrorResponse("차단된 호스트입니다.", {
        status: 403,
        errorCode: "IMAGE_PROXY_BLOCKED_HOST",
        retryable: false,
      });
    }
    if (message.includes("unsupported protocol")) {
      return toApiErrorResponse("지원하지 않는 프로토콜입니다.", {
        status: 400,
        errorCode: "IMAGE_PROXY_PROTOCOL_UNSUPPORTED",
        retryable: false,
      });
    }
    if (message.includes("unsupported port") || message.includes("credentials not allowed")) {
      return toApiErrorResponse("지원하지 않는 원본 URL입니다.", {
        status: 400,
        errorCode: "IMAGE_PROXY_URL_UNSUPPORTED",
        retryable: false,
      });
    }
    if (message.includes("content too large")) {
      return toApiErrorResponse("이미지 크기가 너무 큽니다.", {
        status: 413,
        errorCode: "IMAGE_PROXY_CONTENT_TOO_LARGE",
        retryable: false,
      });
    }
    return toApiErrorResponse("이미지 프록시 요청에 실패했습니다.", {
      status: 502,
      errorCode: "IMAGE_PROXY_REQUEST_FAILED",
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  return handleStudioImageProxyRequest(request);
}
