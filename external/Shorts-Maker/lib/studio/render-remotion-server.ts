import { Buffer } from "node:buffer";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  cancelResponseBodyQuietly,
  fetchWithRedirectValidation,
  readResponseBodyWithinLimit,
} from "@/lib/network/request-guard";
import { fetchAnchorImageBytes } from "@/lib/studio/anchor-image-fetcher";
import {
  buildStudioImageProxyUpstreamHeaders,
  parseStudioImageProxyTarget,
  STUDIO_IMAGE_PROXY_MAX_BYTES,
  STUDIO_IMAGE_PROXY_REDIRECT_LIMIT,
} from "@/lib/studio/image-proxy-shared";
import { inferStudioRenderableMedia } from "@/lib/studio/media-url-utils";
import type { StudioNativeRenderRequest, StudioRemotionCompositionProps } from "@/types/studio-renderer";

const REMOTION_COMPOSITION_ID = "StudioShorts";
const REMOTION_WIDTH = 1080;
const REMOTION_HEIGHT = 1920;
const REMOTION_FPS = 30;
const REMOTION_IMAGE_FETCH_TIMEOUT_MS = 12_000;
const REMOTION_IMAGE_PREFETCH_CONCURRENCY = 4;
const REMOTION_PREPARED_MEDIA_CACHE_MAX_ENTRIES = 4;

let remotionBundlePromise: Promise<string> | null = null;
const preparedStillImageCache = new Map<string, Promise<string>>();

function shouldCacheRemotionBundle(): boolean {
  return process.env.NODE_ENV === "production";
}

function toAbsoluteAssetUrl(value: string | undefined, baseUrl: string): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return new URL(raw.startsWith("/") ? raw : `/${raw}`, baseUrl).toString();
}

function isAnimatedImageLikeUrl(value: string | undefined): boolean {
  return /\.(gif)(\?|#|$)/i.test(String(value || "").trim());
}

function isSvgLikeUrl(value: string | undefined): boolean {
  return /\.(svg)(\?|#|$)/i.test(String(value || "").trim());
}

function toDataUrl(mimeType: string, bytes: Buffer): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function normalizeImageMimeType(raw: string | null): string {
  const value = String(raw || "").trim().toLowerCase();
  if (value.startsWith("image/")) return value;
  return "image/jpeg";
}

function normalizeRenderableMediaMimeType(raw: string | null, url: string): string {
  const value = String(raw || "").trim().toLowerCase().split(";", 1)[0] || "";
  if (value.startsWith("image/") || value.startsWith("video/")) return value;
  if (/\.gif(?:\?|#|$)/i.test(url)) return "image/gif";
  if (/\.webm(?:\?|#|$)/i.test(url)) return "video/webm";
  if (/\.mov(?:\?|#|$)/i.test(url)) return "video/quicktime";
  if (/\.(?:mp4|m4v)(?:\?|#|$)/i.test(url)) return "video/mp4";
  return "application/octet-stream";
}

function rememberPreparedMedia(key: string, loader: Promise<string>): void {
  if (preparedStillImageCache.has(key)) preparedStillImageCache.delete(key);
  while (preparedStillImageCache.size >= REMOTION_PREPARED_MEDIA_CACHE_MAX_ENTRIES) {
    const oldestKey = preparedStillImageCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    preparedStillImageCache.delete(oldestKey);
  }
  preparedStillImageCache.set(key, loader);
}

async function resolvePreparedMedia(key: string, loaderFactory: () => Promise<string>): Promise<string> {
  const cached = preparedStillImageCache.get(key);
  if (cached) {
    preparedStillImageCache.delete(key);
    preparedStillImageCache.set(key, cached);
    return cached;
  }
  const loader = loaderFactory();
  rememberPreparedMedia(key, loader);
  try {
    return await loader;
  } catch (error) {
    if (preparedStillImageCache.get(key) === loader) preparedStillImageCache.delete(key);
    throw error;
  }
}

function buildImageFallbackDataUrl(label: string): string {
  const safeLabel = String(label || "").trim().replace(/[<&>"]/g, "").slice(0, 80) || "Image unavailable";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${REMOTION_WIDTH}" height="${REMOTION_HEIGHT}" viewBox="0 0 ${REMOTION_WIDTH} ${REMOTION_HEIGHT}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#eff6ff"/>
          <stop offset="100%" stop-color="#dbeafe"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <circle cx="540" cy="700" r="210" fill="#93c5fd" opacity="0.22"/>
      <rect x="155" y="920" width="770" height="420" rx="56" fill="#ffffff" opacity="0.92"/>
      <text x="540" y="1090" text-anchor="middle" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#0f172a">
        IMAGE UNAVAILABLE
      </text>
      <text x="540" y="1188" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="#334155">
        ${safeLabel}
      </text>
    </svg>
  `.trim();
  return toDataUrl("image/svg+xml", Buffer.from(svg, "utf8"));
}

async function fetchStillImageSource(
  url: string,
  timeoutMs: number,
  fetchRemote: typeof fetchWithRedirectValidation = fetchWithRedirectValidation
): Promise<{ buffer: Buffer; contentType: string }> {
  const proxiedTarget = parseStudioImageProxyTarget(url);
  if (!proxiedTarget) {
    const directResult = await fetchAnchorImageBytes(
      url,
      {
        fetchImpl: fetch,
        readFile,
        stat,
      },
      {
        maxBytes: STUDIO_IMAGE_PROXY_MAX_BYTES,
        timeoutMs,
      }
    );
    return {
      buffer: directResult.buffer,
      contentType: directResult.contentType,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchRemote(proxiedTarget, {
      signal: controller.signal,
      redirectLimit: STUDIO_IMAGE_PROXY_REDIRECT_LIMIT,
      getHeadersForUrl: buildStudioImageProxyUpstreamHeaders,
    });
    if (!response.ok) {
      await cancelResponseBodyQuietly(response, new Error("remotion proxy response discarded"));
      throw new Error(`HTTP_${response.status}`);
    }
    return {
      buffer: Buffer.from(await readResponseBodyWithinLimit(response, STUDIO_IMAGE_PROXY_MAX_BYTES, "IMAGE_RESPONSE_TOO_LARGE")),
      contentType: response.headers.get("content-type") || "",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function transcodeStillImageToDataUrl(url: string, label: string): Promise<string> {
  try {
    return await resolvePreparedMedia(`still:${url}`, async () => {
      const { buffer: bytes, contentType } = await fetchStillImageSource(url, REMOTION_IMAGE_FETCH_TIMEOUT_MS);
      if (bytes.length <= 0) {
        throw new Error("EMPTY_IMAGE_RESPONSE");
      }

      const mimeType = normalizeImageMimeType(contentType);
      if (mimeType === "image/svg+xml" || isSvgLikeUrl(url)) {
        return toDataUrl("image/svg+xml", bytes);
      }

      const sharpModule = await import("sharp");
      const sharp = sharpModule.default;
      const output = await sharp(bytes, { animated: false, failOn: "none" })
        .rotate()
        .resize({
          width: REMOTION_WIDTH,
          height: REMOTION_HEIGHT,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({
          quality: 88,
          mozjpeg: true,
        })
        .toBuffer();
      return toDataUrl("image/jpeg", output);
    });
  } catch {
    return buildImageFallbackDataUrl(label);
  }
}

async function materializeRenderableMediaToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) {
    if (!/^data:(?:image|video)\//i.test(url) || url.length > Math.ceil(STUDIO_IMAGE_PROXY_MAX_BYTES * 1.5)) {
      throw new Error("INLINE_MEDIA_TOO_LARGE_OR_INVALID");
    }
    return url;
  }
  if (url.startsWith("blob:")) throw new Error("BLOB_MEDIA_NOT_DURABLE");
  return resolvePreparedMedia(`media:${url}`, async () => {
    const { buffer, contentType } = await fetchStillImageSource(url, REMOTION_IMAGE_FETCH_TIMEOUT_MS);
    if (buffer.length <= 0) throw new Error("EMPTY_MEDIA_RESPONSE");
    const mimeType = normalizeRenderableMediaMimeType(contentType, url);
    if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
      throw new Error("UNSUPPORTED_MEDIA_RESPONSE");
    }
    return toDataUrl(mimeType, buffer);
  });
}

function toDurationInFrames(frameDurationsSec: number[], fps: number): number {
  const totalSec = frameDurationsSec.reduce((acc, value) => acc + Math.max(0.001, Number(value) || 0.001), 0);
  return Math.max(1, Math.round(totalSec * fps));
}

async function getRemotionServeUrl(): Promise<string> {
  if (shouldCacheRemotionBundle() && remotionBundlePromise) return remotionBundlePromise;
  const bundlePromise = (async () => {
    const { bundle } = await import("@remotion/bundler");
    return bundle({
      entryPoint: join(process.cwd(), "remotion", "index.ts"),
      onProgress: () => undefined,
    });
  })();
  if (shouldCacheRemotionBundle()) {
    remotionBundlePromise = bundlePromise;
  }
  return bundlePromise;
}

async function toCompositionProps(request: StudioNativeRenderRequest, baseUrl: string): Promise<StudioRemotionCompositionProps> {
  const visuals = request.visuals;
  if (!visuals) {
    throw new Error("REMOTION_VISUALS_REQUIRED");
  }
  const slides = await mapWithConcurrency(visuals.slides, REMOTION_IMAGE_PREFETCH_CONCURRENCY, async (slide, index) => {
    const absoluteImageUrl = toAbsoluteAssetUrl(slide.imageUrl, baseUrl);
    const absoluteMediaUrl = toAbsoluteAssetUrl(slide.mediaUrl, baseUrl);
    const renderable = inferStudioRenderableMedia({
      imageUrl: absoluteImageUrl,
      mediaUrl: absoluteMediaUrl,
      mediaKind: slide.mediaKind,
    });
    if (!renderable) {
      return {
        ...slide,
        imageUrl: undefined,
        mediaUrl: undefined,
      };
    }
    const fallbackLabel =
      String(slide.title || "").trim() ||
      String(slide.text || "").trim() ||
      `Slide ${index + 1}`;
    const renderableUrl = toAbsoluteAssetUrl(renderable.url, baseUrl);
    if (!renderableUrl) {
      return {
        ...slide,
        imageUrl: buildImageFallbackDataUrl(fallbackLabel),
        mediaUrl: undefined,
        mediaKind: "image" as const,
      };
    }
    if (renderable.kind === "video") {
      try {
        return {
          ...slide,
          imageUrl: undefined,
          mediaUrl: await materializeRenderableMediaToDataUrl(renderableUrl),
          mediaKind: "video" as const,
        };
      } catch {
        return {
          ...slide,
          imageUrl: buildImageFallbackDataUrl(fallbackLabel),
          mediaUrl: undefined,
          mediaKind: "image" as const,
        };
      }
    }
    if (slide.mediaKind === "animated_image" || isAnimatedImageLikeUrl(renderableUrl)) {
      try {
        return {
          ...slide,
          imageUrl: await materializeRenderableMediaToDataUrl(renderableUrl),
          mediaUrl: undefined,
          mediaKind: "image" as const,
        };
      } catch {
        return {
          ...slide,
          imageUrl: buildImageFallbackDataUrl(fallbackLabel),
          mediaUrl: undefined,
          mediaKind: "image" as const,
        };
      }
    }
    return {
      ...slide,
      imageUrl: await transcodeStillImageToDataUrl(renderableUrl, fallbackLabel),
      mediaUrl: undefined,
      mediaKind: "image" as const,
    };
  });
  const absoluteTemplateImageUrl = toAbsoluteAssetUrl(visuals.templateImageUrl, baseUrl);
  const templateImageUrl =
    visuals.templateImageEnabled && absoluteTemplateImageUrl
      ? await transcodeStillImageToDataUrl(absoluteTemplateImageUrl, "Template background")
      : absoluteTemplateImageUrl;
  return {
    slides,
    branding: visuals.branding,
    templateId: visuals.templateId,
    templateData: visuals.templateData,
    templateImageEnabled: visuals.templateImageEnabled,
    templateImageUrl,
    templateImageLayout: visuals.templateImageLayout,
    templateLayoutApply: visuals.templateLayoutApply,
    frameDurationsSec: request.frameDurationsSec,
    durationInFrames: toDurationInFrames(request.frameDurationsSec, REMOTION_FPS),
    fps: REMOTION_FPS,
    playbackRate: request.audioOptions?.playbackRate,
  };
}

export async function renderRemotionSlideshowVideo(
  request: StudioNativeRenderRequest,
  outputLocation: string,
  context: { baseUrl: string }
): Promise<void> {
  const inputProps = await toCompositionProps(request, context.baseUrl);
  const serveUrl = await getRemotionServeUrl();
  const { renderMedia, selectComposition } = await import("@remotion/renderer");
  const composition = await selectComposition({
    serveUrl,
    id: REMOTION_COMPOSITION_ID,
    inputProps,
    logLevel: "error",
  });

  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    outputLocation,
    codec: "h264",
    muted: true,
    overwrite: true,
    logLevel: "error",
    concurrency: 2,
    imageFormat: "jpeg",
  });
}

export const __renderRemotionServerTestInternals = {
  toCompositionProps,
  transcodeStillImageToDataUrl,
  fetchStillImageSource,
  clearPreparedStillImageCache: () => preparedStillImageCache.clear(),
  getPreparedStillImageCacheSize: () => preparedStillImageCache.size,
};
