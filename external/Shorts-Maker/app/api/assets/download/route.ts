import { stat } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import {
  createLocalStorageReadStream,
  getLocalStorageFilePath,
  hasLocalStorageConfig,
  parseLocalStoragePublicUrl,
} from "@/lib/local/storage";
import { assertContentLengthWithinLimit, fetchWithRedirectValidation } from "@/lib/network/request-guard";
import { toApiErrorResponse } from "@/lib/publish/api-error";

export const runtime = "nodejs";

const ASSET_DOWNLOAD_REDIRECT_LIMIT = 3;
const ASSET_DOWNLOAD_MAX_BYTES = 250 * 1024 * 1024;

export type AssetsDownloadRouteDependencies = {
  requireSessionUser: typeof requireSessionUser;
  hasLocalStorageConfig: typeof hasLocalStorageConfig;
  parseLocalStoragePublicUrl: typeof parseLocalStoragePublicUrl;
  getLocalStorageFilePath: typeof getLocalStorageFilePath;
  createLocalStorageReadStream: typeof createLocalStorageReadStream;
  statLocalFile: (filePath: string) => Promise<{ size: number; isFile: boolean } | null>;
  fetchWithRedirectValidation: typeof fetchWithRedirectValidation;
};

export const defaultAssetsDownloadRouteDependencies: AssetsDownloadRouteDependencies = {
  requireSessionUser,
  hasLocalStorageConfig,
  parseLocalStoragePublicUrl,
  getLocalStorageFilePath,
  createLocalStorageReadStream,
  statLocalFile: async (filePath) => {
    const stats = await stat(filePath).catch(() => null);
    if (!stats) return null;
    return { size: stats.size, isFile: stats.isFile() };
  },
  fetchWithRedirectValidation,
};

function toSafeFileName(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();
  if (!cleaned) return "shorts.mp4";
  return cleaned.toLowerCase().endsWith(".mp4") ? cleaned : `${cleaned}.mp4`;
}

function resolveFileName(rawName: string, sourceUrl: URL): string {
  const preferred = toSafeFileName(rawName);
  if (rawName.trim()) return preferred;
  const pathName = decodeURIComponent(sourceUrl.pathname.split("/").pop() || "").trim();
  if (pathName) return toSafeFileName(pathName);
  return "shorts.mp4";
}

function toDownloadResponse(input: {
  body: BodyInit;
  contentType: string;
  contentLength: string;
  fileName: string;
}): NextResponse {
  const response = new NextResponse(input.body, {
    status: 200,
    headers: {
      "Content-Type": input.contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(input.fileName)}`,
      "Cache-Control": "no-store",
    },
  });
  if (input.contentLength.trim()) {
    response.headers.set("Content-Length", input.contentLength.trim());
  }
  return response;
}

export async function handleAssetsDownloadGet(
  request: NextRequest,
  deps: AssetsDownloadRouteDependencies = defaultAssetsDownloadRouteDependencies
) {
  const user = deps.requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  void user;

  try {
    const sourceRaw = (request.nextUrl.searchParams.get("url") || "").trim();
    const fileNameRaw = (request.nextUrl.searchParams.get("filename") || "").trim();
    if (!sourceRaw) {
      return toApiErrorResponse("다운로드 URL이 필요합니다.", {
        status: 400,
        errorCode: "ASSET_DOWNLOAD_URL_REQUIRED",
        retryable: false,
      });
    }

    let sourceUrl: URL;
    try {
      sourceUrl = new URL(sourceRaw);
    } catch {
      return toApiErrorResponse("유효하지 않은 다운로드 URL입니다.", {
        status: 400,
        errorCode: "ASSET_DOWNLOAD_URL_INVALID",
        retryable: false,
      });
    }
    if (sourceUrl.protocol !== "http:" && sourceUrl.protocol !== "https:") {
      return toApiErrorResponse("http/https URL만 다운로드할 수 있습니다.", {
        status: 400,
        errorCode: "ASSET_DOWNLOAD_PROTOCOL_INVALID",
        retryable: false,
      });
    }

    // Local-storage assets live on this server's own disk. Fetching them over HTTP would
    // hit the SSRF guard, which blocks loopback hosts and non-80/443 ports by design.
    const localObject = deps.hasLocalStorageConfig() ? deps.parseLocalStoragePublicUrl(sourceRaw) : null;
    if (localObject) {
      let filePath: string;
      try {
        filePath = deps.getLocalStorageFilePath(localObject.bucket, localObject.path);
      } catch {
        return toApiErrorResponse("유효하지 않은 다운로드 URL입니다.", {
          status: 400,
          errorCode: "ASSET_DOWNLOAD_URL_INVALID",
          retryable: false,
        });
      }
      const fileStat = await deps.statLocalFile(filePath);
      if (!fileStat?.isFile) {
        return toApiErrorResponse("다운로드할 파일을 찾을 수 없습니다.", {
          status: 404,
          errorCode: "ASSET_DOWNLOAD_NOT_FOUND",
          retryable: false,
        });
      }
      assertContentLengthWithinLimit(String(fileStat.size), ASSET_DOWNLOAD_MAX_BYTES);
      return toDownloadResponse({
        body: deps.createLocalStorageReadStream(localObject.bucket, localObject.path) as unknown as BodyInit,
        contentType: localObject.path.toLowerCase().endsWith(".mp4") ? "video/mp4" : "application/octet-stream",
        contentLength: String(fileStat.size),
        fileName: resolveFileName(fileNameRaw, sourceUrl),
      });
    }

    const upstream = await deps.fetchWithRedirectValidation(sourceUrl, {
      signal: AbortSignal.timeout(15_000),
      redirectLimit: ASSET_DOWNLOAD_REDIRECT_LIMIT,
    });

    if (!upstream.ok || !upstream.body) {
      return toApiErrorResponse(`다운로드 원본 응답이 올바르지 않습니다. (${upstream.status})`, {
        status: 400,
        errorCode: "ASSET_DOWNLOAD_UPSTREAM_FAILED",
        retryable: false,
      });
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstream.headers.get("content-length") || "";
    assertContentLengthWithinLimit(contentLength, ASSET_DOWNLOAD_MAX_BYTES);
    return toDownloadResponse({
      body: upstream.body,
      contentType,
      contentLength,
      fileName: resolveFileName(fileNameRaw, sourceUrl),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("blocked")) {
      return toApiErrorResponse("차단된 다운로드 호스트입니다.", {
        status: 403,
        errorCode: "ASSET_DOWNLOAD_BLOCKED_HOST",
        retryable: false,
      });
    }
    if (message.includes("unsupported protocol") || message.includes("unsupported port") || message.includes("credentials not allowed")) {
      return toApiErrorResponse("지원하지 않는 다운로드 URL입니다.", {
        status: 400,
        errorCode: "ASSET_DOWNLOAD_URL_UNSUPPORTED",
        retryable: false,
      });
    }
    if (message.includes("content too large")) {
      return toApiErrorResponse("다운로드 파일이 너무 큽니다.", {
        status: 413,
        errorCode: "ASSET_DOWNLOAD_TOO_LARGE",
        retryable: false,
      });
    }
    return toApiErrorResponse(message, {
      status: 500,
      errorCode: "ASSET_DOWNLOAD_FAILED",
      retryable: false,
    });
  }
}

export async function GET(request: NextRequest) {
  return handleAssetsDownloadGet(request);
}
