import { PassThrough } from "node:stream";
import { google } from "googleapis";
import type { OAuthAccount } from "@/lib/publish/types";

const MAX_UPLOAD_SOURCE_BYTES = 512 * 1024 * 1024;
const ALLOWED_UPLOAD_SOURCE_TYPES = ["video/mp4", "video/quicktime", "video/webm", "application/octet-stream"];

export class YoutubeUploadError extends Error {
  errorCode: string;
  retryable: boolean;

  constructor(message: string, options: { errorCode: string; retryable: boolean }) {
    super(message);
    this.name = "YoutubeUploadError";
    this.errorCode = options.errorCode;
    this.retryable = options.retryable;
  }
}

function classifyYoutubeUploadFailure(error: unknown): YoutubeUploadError {
  if (error instanceof YoutubeUploadError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const errorLike = error as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown; data?: unknown };
    errors?: Array<{ reason?: unknown; message?: unknown }>;
  };
  const statusCandidates = [
    Number(errorLike?.status),
    Number(errorLike?.code),
    Number(errorLike?.response?.status),
  ].filter((value) => Number.isFinite(value));
  const status = statusCandidates[0] ?? 0;
  const reasonRaw = Array.isArray(errorLike?.errors) ? errorLike.errors[0]?.reason : "";
  const reason = typeof reasonRaw === "string" ? reasonRaw.trim().toLowerCase() : "";
  const normalizedMessage = message.trim().toLowerCase();

  if (status === 401 || status === 403) {
    return new YoutubeUploadError(message, {
      errorCode: reason === "forbidden" ? "YOUTUBE_UPLOAD_FORBIDDEN" : "YOUTUBE_UPLOAD_AUTH_FAILED",
      retryable: false,
    });
  }
  if (status === 400 || status === 404) {
    return new YoutubeUploadError(message, {
      errorCode: "YOUTUBE_UPLOAD_INVALID_REQUEST",
      retryable: false,
    });
  }
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) {
    return new YoutubeUploadError(message, {
      errorCode: "YOUTUBE_UPLOAD_UPSTREAM_RETRYABLE",
      retryable: true,
    });
  }
  if (
    normalizedMessage.includes("google_client_id") ||
    normalizedMessage.includes("google_client_secret") ||
    normalizedMessage.includes("youtube upload succeeded but no video id returned") ||
    normalizedMessage.includes("unable to fetch video asset: 404")
  ) {
    return new YoutubeUploadError(message, {
      errorCode: "YOUTUBE_UPLOAD_CONFIGURATION_INVALID",
      retryable: false,
    });
  }
  if (
    normalizedMessage.includes("unable to fetch video asset: 5") ||
    normalizedMessage.includes("econnreset") ||
    normalizedMessage.includes("etimedout") ||
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("rate limit")
  ) {
    return new YoutubeUploadError(message, {
      errorCode: "YOUTUBE_UPLOAD_NETWORK_RETRYABLE",
      retryable: true,
    });
  }
  return new YoutubeUploadError(message, {
    errorCode: "YOUTUBE_UPLOAD_FAILED",
    retryable: false,
  });
}

function getGoogleOauthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
  const appBaseUrl = process.env.APP_BASE_URL?.trim() || "";
  const redirectFromBase = appBaseUrl ? `${appBaseUrl.replace(/\/$/, "")}/api/auth/youtube/callback` : "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() || redirectFromBase || "http://localhost:3000/api/auth/youtube/callback";
  if (!clientId || !clientSecret) {
    throw new YoutubeUploadError("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required", {
      errorCode: "YOUTUBE_OAUTH_CONFIG_MISSING",
      retryable: false,
    });
  }
  return { clientId, clientSecret, redirectUri };
}

export function createYoutubeOauthClient() {
  const cfg = getGoogleOauthConfig();
  return new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
}

export function getYoutubeAuthUrl(state?: string): string {
  const oauth2Client = createYoutubeOauthClient();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
    ],
    state,
  });
}

export async function exchangeYoutubeCode(code: string) {
  const oauth2Client = createYoutubeOauthClient();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  const yt = google.youtube({ version: "v3", auth: oauth2Client });
  const channels = await yt.channels.list({
    part: ["snippet"],
    mine: true,
    maxResults: 1,
  });

  const channel = channels.data.items?.[0];
  if (!channel?.id || !channel.snippet?.title) {
    throw new Error("Failed to resolve YouTube channel from OAuth token");
  }

  return {
    channelId: channel.id,
    channelTitle: channel.snippet.title,
    accessToken: tokens.access_token || "",
    refreshToken: tokens.refresh_token || "",
    expiryDate: tokens.expiry_date || Date.now() + 3600_000,
    scope: tokens.scope || "",
  };
}

async function fetchVideoAsStream(videoUrl: string): Promise<PassThrough> {
  const response = await fetch(videoUrl, { cache: "no-store" });
  if (!response.ok || !response.body) {
    throw new YoutubeUploadError(`Unable to fetch video asset: ${response.status}`, {
      errorCode: response.status >= 500 ? "YOUTUBE_UPLOAD_SOURCE_FETCH_RETRYABLE" : "YOUTUBE_UPLOAD_SOURCE_FETCH_FAILED",
      retryable: response.status >= 500 || response.status === 429,
    });
  }
  const contentType = response.headers.get("content-type")?.trim().toLowerCase() || "";
  if (
    contentType &&
    !ALLOWED_UPLOAD_SOURCE_TYPES.some((allowed) => contentType === allowed || contentType.startsWith(`${allowed};`)) &&
    !contentType.startsWith("video/")
  ) {
    throw new YoutubeUploadError(`Unable to fetch video asset: unsupported content-type (${contentType})`, {
      errorCode: "YOUTUBE_UPLOAD_SOURCE_INVALID_TYPE",
      retryable: false,
    });
  }
  const contentLengthRaw = response.headers.get("content-length");
  const contentLength = Number(contentLengthRaw);
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_SOURCE_BYTES) {
    throw new YoutubeUploadError(`Unable to fetch video asset: file too large (${contentLength})`, {
      errorCode: "YOUTUBE_UPLOAD_SOURCE_TOO_LARGE",
      retryable: false,
    });
  }

  const pass = new PassThrough();
  const reader = response.body.getReader();
  let streamedBytes = 0;

  const pump = async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        pass.end();
        return;
      }
      if (value) {
        streamedBytes += value.byteLength;
        if (streamedBytes > MAX_UPLOAD_SOURCE_BYTES) {
          throw new YoutubeUploadError(`Unable to fetch video asset: file too large (${streamedBytes})`, {
            errorCode: "YOUTUBE_UPLOAD_SOURCE_TOO_LARGE",
            retryable: false,
          });
        }
        pass.write(Buffer.from(value));
      }
    }
  };
  void pump().catch((error) => pass.destroy(error));
  return pass;
}

export async function uploadYoutubeShorts(input: {
  account: OAuthAccount;
  videoUrl: string;
  title: string;
  description: string;
  tags: string[];
  privacyStatus: "private" | "public" | "unlisted";
}) {
  try {
    const oauth2Client = createYoutubeOauthClient();
    oauth2Client.setCredentials({
      access_token: input.account.accessToken,
      refresh_token: input.account.refreshToken,
      expiry_date: input.account.expiryDate,
    });

    const yt = google.youtube({ version: "v3", auth: oauth2Client });
    const mediaBody = await fetchVideoAsStream(input.videoUrl);

    const res = await yt.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: input.title,
          description: input.description,
          tags: input.tags,
        },
        status: {
          privacyStatus: input.privacyStatus,
        },
      },
      media: {
        mimeType: "video/mp4",
        body: mediaBody,
      },
    });

    const videoId = res.data.id;
    if (!videoId) {
      throw new YoutubeUploadError("YouTube upload succeeded but no video id returned", {
        errorCode: "YOUTUBE_UPLOAD_VIDEO_ID_MISSING",
        retryable: false,
      });
    }

    const credentials = oauth2Client.credentials;
    return {
      videoId,
      url: `https://www.youtube.com/shorts/${videoId}`,
      refreshed: {
        accessToken: credentials.access_token || input.account.accessToken,
        expiryDate: credentials.expiry_date || input.account.expiryDate,
      },
    };
  } catch (error) {
    throw classifyYoutubeUploadFailure(error);
  }
}
