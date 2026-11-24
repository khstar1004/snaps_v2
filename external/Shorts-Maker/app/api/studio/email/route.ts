import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { isRequestBodyParseError, readJsonObjectBody } from "@/lib/network/request-body";
import { sendMailViaGmailSmtp } from "@/lib/email/smtp";
import { assertContentLengthWithinLimit, fetchWithRedirectValidation } from "@/lib/network/request-guard";
import { toApiErrorResponse } from "@/lib/publish/api-error";

export const runtime = "nodejs";

const MAIL_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
const MAIL_REDIRECT_LIMIT = 3;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseRecipients(raw: unknown): { recipients: string[]; invalidRecipients: string[] } {
  const values = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const normalized = values
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
  const uniqueRecipients = normalized.filter((item, index) => normalized.indexOf(item) === index);
  return {
    recipients: uniqueRecipients.filter(isValidEmail),
    invalidRecipients: uniqueRecipients.filter((item) => !isValidEmail(item)),
  };
}

function toSafeFileName(value: string): string {
  const cleaned = value.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!cleaned) return "shorts.mp4";
  return cleaned.toLowerCase().endsWith(".mp4") ? cleaned : `${cleaned}.mp4`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isMailInputError(message: string): boolean {
  return [
    "유효한 메일 주소",
    "전송할 영상",
    "http/https URL",
    "unsupported protocol",
    "credentials not allowed",
    "unsupported port",
    "blocked host",
    "blocked resolved address",
    "dns lookup failed",
    "invalid url",
    "too many redirects",
    "첨부 파일을 가져오지 못했습니다.",
    "첨부 가능한 최대 용량",
    "content too large",
  ].some((keyword) => message.toLowerCase().includes(keyword.toLowerCase()));
}

async function loadAttachment(sourceRaw: string): Promise<{ content: Buffer; contentType: string }> {
  const sourceUrl = new URL(sourceRaw);
  if (sourceUrl.protocol !== "http:" && sourceUrl.protocol !== "https:") {
    throw new Error("http/https URL만 첨부할 수 있습니다.");
  }
  const response = await fetchWithRedirectValidation(sourceUrl, {
    signal: AbortSignal.timeout(20_000),
    redirectLimit: MAIL_REDIRECT_LIMIT,
  });
  if (!response.ok || !response.body) {
    throw new Error(`첨부 파일을 가져오지 못했습니다. (${response.status})`);
  }
  assertContentLengthWithinLimit(response.headers.get("content-length") || "", MAIL_ATTACHMENT_MAX_BYTES);
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAIL_ATTACHMENT_MAX_BYTES) {
    throw new Error("첨부 가능한 최대 용량(25MB)을 초과했습니다.");
  }
  return {
    content: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || "video/mp4",
  };
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  void user;

  try {
    const body = await readJsonObjectBody(request);
    const { recipients, invalidRecipients } = parseRecipients(body.to);
    const videoUrl = String(body.videoUrl || "").trim();
    const fileName = toSafeFileName(String(body.fileName || ""));
    const title = String(body.title || "쇼츠 결과물").trim() || "쇼츠 결과물";
    const safeTitleHtml = escapeHtml(title);
    const safeVideoUrlHtml = escapeHtml(videoUrl);

    if (invalidRecipients.length > 0) {
      return toApiErrorResponse(`유효하지 않은 메일 주소가 있습니다: ${invalidRecipients.join(", ")}`, {
        status: 400,
        errorCode: "STUDIO_EMAIL_INVALID_TO",
        retryable: false,
      });
    }
    if (recipients.length === 0) {
      return toApiErrorResponse("유효한 메일 주소를 입력해 주세요. 콤마(,)로 여러 명을 구분할 수 있습니다.", {
        status: 400,
        errorCode: "STUDIO_EMAIL_INVALID_TO",
        retryable: false,
      });
    }
    if (!videoUrl) {
      return toApiErrorResponse("전송할 영상이 없습니다.", {
        status: 400,
        errorCode: "STUDIO_EMAIL_VIDEO_REQUIRED",
        retryable: false,
      });
    }

    let attachmentMode: "attachment" | "link_only" = "link_only";
    try {
      const attachment = await loadAttachment(videoUrl);
      const sent = await sendMailViaGmailSmtp({
        to: recipients,
        subject: `[Shorts Studio] ${title}`,
        text: `${title}\n\n작업물이 첨부되어 있습니다.\n원본 링크: ${videoUrl}`,
        html: `<p>${safeTitleHtml}</p><p>작업물이 첨부되어 있습니다.</p><p><a href="${safeVideoUrlHtml}">원본 링크 열기</a></p>`,
        attachment: {
          filename: fileName,
          contentType: attachment.contentType,
          content: attachment.content,
        },
      });
      attachmentMode = sent.mode;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldFallbackToLinkOnly =
        message.includes("25MB") ||
        message.includes("content too large") ||
        message.includes("첨부 가능한 최대 용량");
      if (!shouldFallbackToLinkOnly) {
        throw error;
      }
      const sent = await sendMailViaGmailSmtp({
        to: recipients,
        subject: `[Shorts Studio] ${title}`,
        text: `${title}\n\n파일 용량이 커서 첨부 대신 다운로드 링크를 보냅니다.\n${videoUrl}`,
        html: `<p>${safeTitleHtml}</p><p>파일 용량이 커서 첨부 대신 다운로드 링크를 보냅니다.</p><p><a href="${safeVideoUrlHtml}">영상 다운로드 링크 열기</a></p>`,
      });
      attachmentMode = sent.mode;
    }

    return NextResponse.json({
      ok: true,
      sentTo: recipients.join(", "),
      deliveryMode: attachmentMode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const invalidInput = isRequestBodyParseError(error) || isMailInputError(message);
    return toApiErrorResponse(message, {
      status: invalidInput ? 400 : 500,
      errorCode: invalidInput ? "STUDIO_EMAIL_INVALID_INPUT" : "STUDIO_EMAIL_SEND_FAILED",
      retryable: false,
    });
  }
}
