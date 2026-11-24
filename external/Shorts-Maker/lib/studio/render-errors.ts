export const RENDER_ERROR_CODES = [
  "LOAD_CORE_FAILED",
  "ASSET_FETCH_FAILED",
  "SFX_ASSET_UNAVAILABLE",
  "BUFFER_DETACHED",
  "FS_WRITE_FAILED",
  "MEMORY_BUDGET_EXCEEDED",
  "SLIDESHOW_ENCODE_FAILED",
  "AUDIO_MIX_FAILED",
  "READ_OUTPUT_FAILED",
  "TIMEOUT",
  "UNKNOWN",
] as const;

export type RenderErrorCode = (typeof RENDER_ERROR_CODES)[number];

export type ClassifiedRenderError = {
  code: RenderErrorCode;
  message: string;
  retryable: boolean;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

export function classifyRenderError(error: unknown): ClassifiedRenderError {
  const message = toErrorMessage(error);
  const tagged = /^\[([A-Z_]+)\]\s*/.exec(message);
  if (tagged && (RENDER_ERROR_CODES as readonly string[]).includes(tagged[1])) {
    const code = tagged[1] as RenderErrorCode;
    return {
      code,
      message: message.replace(/^\[[A-Z_]+\]\s*/, ""),
      retryable:
        code === "LOAD_CORE_FAILED" ||
        code === "ASSET_FETCH_FAILED" ||
        code === "BUFFER_DETACHED" ||
        code === "FS_WRITE_FAILED" ||
        code === "READ_OUTPUT_FAILED" ||
        code === "TIMEOUT",
    };
  }
  const lower = message.toLowerCase();

  if (includesAny(lower, ["arraybuffer", "detached"])) {
    return { code: "BUFFER_DETACHED", message, retryable: true };
  }
  if (includesAny(lower, ["failed to load bgm", "failed to load sfx", "failed to load"])) {
    return { code: "ASSET_FETCH_FAILED", message, retryable: true };
  }
  if (includesAny(lower, ["writefile", "fs error", "errnoerror"])) {
    return { code: "FS_WRITE_FAILED", message, retryable: true };
  }
  if (includesAny(lower, ["memory_budget_exceeded", "memory budget exceeded", "out of memory budget"])) {
    return { code: "MEMORY_BUDGET_EXCEEDED", message, retryable: false };
  }
  if (includesAny(lower, ["timeout", "ffmpeg_timeout"])) {
    return { code: "TIMEOUT", message, retryable: true };
  }
  if (includesAny(lower, ["without final.mp4 output", "readfile"])) {
    return { code: "READ_OUTPUT_FAILED", message, retryable: true };
  }
  if (includesAny(lower, ["ffmpeg slideshow failed"])) {
    return { code: "SLIDESHOW_ENCODE_FAILED", message, retryable: false };
  }
  if (includesAny(lower, ["ffmpeg mix-bgm-sfx failed", "ffmpeg mux-narration failed", "stream specifier", "filtergraph"])) {
    return { code: "AUDIO_MIX_FAILED", message, retryable: false };
  }
  if (includesAny(lower, ["failed to import", "load ffmpeg", "ffmpeg is not loaded"])) {
    return { code: "LOAD_CORE_FAILED", message, retryable: true };
  }
  return { code: "UNKNOWN", message, retryable: false };
}

export function shouldRecycleFfmpegSession(code: RenderErrorCode): boolean {
  return code === "BUFFER_DETACHED" || code === "FS_WRITE_FAILED" || code === "READ_OUTPUT_FAILED" || code === "TIMEOUT" || code === "LOAD_CORE_FAILED";
}
