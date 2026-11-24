"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestStudioVoicePreview } from "@/lib/api/studio-client";

const DEFAULT_VOICE_PREVIEW_TEXT = "안녕하세요. 반갑습니다.";

export function toTypecastSpeedOverride(value: string | number): number | undefined {
  const normalized = String(value ?? "").trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function resolveStudioVoicePreviewSpeed(
  selectedTypecastSpeed: string,
  typecastSpeedOverride?: number | string
): number | undefined {
  return toTypecastSpeedOverride(typecastSpeedOverride ?? selectedTypecastSpeed);
}

export function resolveStudioVoicePreviewPlaybackWindow(input: {
  trimStartMs?: number;
  trimEndMs?: number;
  durationMs?: number;
}): { trimStartMs: number; trimEndMs: number; playbackDurationMs: number } | null {
  const trimStartMs = Number.isFinite(input.trimStartMs) ? Math.max(0, Math.floor(Number(input.trimStartMs))) : 0;
  const durationMs = Number.isFinite(input.durationMs) ? Math.max(1, Math.floor(Number(input.durationMs))) : null;
  const trimEndCandidate = Number(input.trimEndMs);
  const trimEndMs = Number.isFinite(trimEndCandidate) && trimEndCandidate > trimStartMs
    ? Math.floor(trimEndCandidate)
    : durationMs !== null
      ? trimStartMs + durationMs
      : null;
  if (trimEndMs === null || trimEndMs <= trimStartMs) return null;
  return {
    trimStartMs,
    trimEndMs,
    playbackDurationMs: Math.max(1, durationMs ?? trimEndMs - trimStartMs),
  };
}

export function resolveStudioVoicePreviewTimeline(
  input: { trimStartMs?: number; trimEndMs?: number; durationMs?: number }
): { trimStartMs: number; trimEndMs: number; speechDurationMs: number } | null {
  const playbackWindow = resolveStudioVoicePreviewPlaybackWindow(input);
  if (!playbackWindow) return null;
  return {
    trimStartMs: playbackWindow.trimStartMs,
    trimEndMs: playbackWindow.trimEndMs,
    speechDurationMs: playbackWindow.playbackDurationMs,
  };
}

export function isStudioVoicePreviewSessionCurrent(input: {
  currentSessionId: number;
  previewSessionId: number;
  currentAbortController?: AbortController | null;
  expectedAbortController?: AbortController | null;
}): boolean {
  if (input.currentSessionId !== input.previewSessionId) return false;
  if (input.expectedAbortController && input.currentAbortController !== input.expectedAbortController) return false;
  return true;
}

type StudioVoicePreviewTimerHandle = ReturnType<typeof setTimeout>;

export type StudioVoicePreviewAudioLike = {
  currentTime: number;
  readyState: number;
  preload: string;
  volume: number;
  onended: ((event: Event) => unknown) | null;
  onerror: ((event: Event) => unknown) | null;
  ontimeupdate: ((event: Event) => unknown) | null;
  addEventListener: (type: string, listener: () => void, options?: { once?: boolean }) => void;
  load: () => void;
  pause: () => void;
  play: () => Promise<void>;
};

export type StudioVoicePreviewPlaybackController = {
  audio: StudioVoicePreviewAudioLike;
  start: () => Promise<boolean>;
  stop: () => void;
};

export function createStudioVoicePreviewPlaybackController(input: {
  audio: StudioVoicePreviewAudioLike;
  blobUrl: string;
  timeline: ReturnType<typeof resolveStudioVoicePreviewTimeline>;
  isCurrent: () => boolean;
  onComplete: () => void;
  revokeObjectUrl: (url: string) => void;
  scheduleTimer: (callback: () => void, delayMs: number) => StudioVoicePreviewTimerHandle;
  clearTimer: (handle: StudioVoicePreviewTimerHandle) => void;
}): StudioVoicePreviewPlaybackController {
  let speechTimer: StudioVoicePreviewTimerHandle | null = null;
  let blobUrl = input.blobUrl;
  let completed = false;

  const clearSpeechTimer = () => {
    if (!speechTimer) return;
    input.clearTimer(speechTimer);
    speechTimer = null;
  };
  const revokeBlobUrl = () => {
    if (!blobUrl) return;
    input.revokeObjectUrl(blobUrl);
    blobUrl = "";
  };
  const complete = () => {
    if (completed || !input.isCurrent()) return;
    completed = true;
    clearSpeechTimer();
    input.audio.pause();
    revokeBlobUrl();
    input.onComplete();
  };
  const stop = () => {
    completed = true;
    clearSpeechTimer();
    input.audio.pause();
    input.audio.currentTime = 0;
    revokeBlobUrl();
  };
  const start = async () => {
    input.audio.onended = complete;
    input.audio.onerror = complete;
    input.audio.ontimeupdate = () => {
      if (input.timeline && input.audio.currentTime * 1000 >= input.timeline.trimEndMs) {
        complete();
      }
    };
    if (input.timeline?.trimStartMs && input.audio.readyState < 1) {
      await new Promise<void>((resolve) => {
        const settle = () => resolve();
        input.audio.addEventListener("loadedmetadata", settle, { once: true });
        input.audio.addEventListener("error", settle, { once: true });
        input.audio.load();
      });
    }
    if (!input.isCurrent()) return false;
    if (input.timeline?.trimStartMs) {
      input.audio.currentTime = input.timeline.trimStartMs / 1000;
    }
    await input.audio.play();
    if (!input.isCurrent()) return false;
    if (input.timeline) {
      speechTimer = input.scheduleTimer(complete, input.timeline.speechDurationMs);
    }
    return true;
  };

  return { audio: input.audio, start, stop };
}

export function resolveStudioDialoguePreviewVoiceId(input: {
  segmentType?: "narration" | "quote";
  segmentVoiceId?: string;
  speakerId?: string;
  speakerVoices: Array<{ speakerId: string; voiceId: string }>;
  narrationVoiceId: string;
  quoteVoiceId?: string;
  maleVoiceId?: string;
  femaleVoiceId?: string;
}): string {
  const segmentVoiceId = String(input.segmentVoiceId || "").trim();
  if (segmentVoiceId) return segmentVoiceId;
  const speakerId = String(input.speakerId || "").trim().toLowerCase();
  if (speakerId) {
    const speakerVoiceId = String(
      input.speakerVoices.find((row) => String(row.speakerId || "").trim().toLowerCase() === speakerId)?.voiceId || ""
    ).trim();
    if (speakerVoiceId) return speakerVoiceId;
  }
  const narrationVoiceId = String(input.narrationVoiceId || "").trim();
  if (input.segmentType === "narration") return narrationVoiceId;
  const quoteVoiceId = String(input.quoteVoiceId || "").trim();
  const maleVoiceId = String(input.maleVoiceId || "").trim();
  const femaleVoiceId = String(input.femaleVoiceId || "").trim();
  const quoteFallbackVoiceId = quoteVoiceId || maleVoiceId || femaleVoiceId || narrationVoiceId;
  if (/(^|[_-])(male|man|boy|guy|dad|father|husband|son|bro|남|남자|남성)([_-]|$)/u.test(speakerId)) {
    return maleVoiceId || quoteFallbackVoiceId;
  }
  if (/(^|[_-])(female|woman|girl|mom|mother|wife|daughter|sis|여|여자|여성)([_-]|$)/u.test(speakerId)) {
    return femaleVoiceId || quoteFallbackVoiceId;
  }
  return quoteFallbackVoiceId;
}

export function useStudioVoicePreview(
  selectedVoiceId: string,
  selectedTypecastEmotionType: string,
  selectedTypecastSpeed: string
) {
  const [voicePreviewLoading, setVoicePreviewLoading] = useState(false);
  const [voicePreviewPlaying, setVoicePreviewPlaying] = useState(false);
  const voicePreviewControllerRef = useRef<StudioVoicePreviewPlaybackController | null>(null);
  const voicePreviewAbortRef = useRef<AbortController | null>(null);
  const voicePreviewSessionRef = useRef(0);

  const handleStopVoicePreview = useCallback(() => {
    voicePreviewSessionRef.current += 1;
    voicePreviewControllerRef.current?.stop();
    voicePreviewControllerRef.current = null;
    voicePreviewAbortRef.current?.abort();
    voicePreviewAbortRef.current = null;
    setVoicePreviewPlaying(false);
    setVoicePreviewLoading(false);
  }, []);

  const previewVoiceText = useCallback(async (
    text: string,
    voiceIdOverride?: string,
    typecastSpeedOverride?: number | string
  ) => {
    const safeText = text.trim();
    if (!safeText) {
      alert("미리들을 문구가 비어 있습니다.");
      return;
    }
    handleStopVoicePreview();
    const previewSessionId = voicePreviewSessionRef.current;
    const controller = new AbortController();
    voicePreviewAbortRef.current = controller;
    setVoicePreviewLoading(true);
    try {
      const { responseOk, data } = await requestStudioVoicePreview(
        {
          voiceId: (voiceIdOverride || selectedVoiceId).trim(),
          text: safeText,
          typecastEmotionType: selectedTypecastEmotionType.trim() || undefined,
          typecastSpeed: resolveStudioVoicePreviewSpeed(selectedTypecastSpeed, typecastSpeedOverride),
        },
        { signal: controller.signal }
      );
      if (!responseOk || !data.ok || !data.audioBase64) {
        throw new Error(data.error || "음성 미리듣기에 실패했습니다.");
      }
      if (!isStudioVoicePreviewSessionCurrent({ currentSessionId: voicePreviewSessionRef.current, previewSessionId })) return;
      const mimeType = data.mimeType || "audio/mpeg";
      const bin = atob(data.audioBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
      const audio = new Audio(blobUrl);
      audio.preload = "auto";
      audio.volume = 1;
      const previewTimeline = resolveStudioVoicePreviewTimeline(data);
      const playbackController = createStudioVoicePreviewPlaybackController({
        audio,
        blobUrl,
        timeline: previewTimeline,
        isCurrent: () => voicePreviewControllerRef.current === playbackController && voicePreviewSessionRef.current === previewSessionId,
        onComplete: () => {
          if (voicePreviewControllerRef.current !== playbackController) return;
          voicePreviewControllerRef.current = null;
          setVoicePreviewPlaying(false);
        },
        revokeObjectUrl: (url) => URL.revokeObjectURL(url),
        scheduleTimer: (callback, delayMs) => setTimeout(callback, delayMs),
        clearTimer: (handle) => clearTimeout(handle),
      });
      voicePreviewControllerRef.current = playbackController;
      const started = await playbackController.start();
      if (started) {
        setVoicePreviewPlaying(true);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (!isStudioVoicePreviewSessionCurrent({ currentSessionId: voicePreviewSessionRef.current, previewSessionId })) return;
      handleStopVoicePreview();
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      if (isStudioVoicePreviewSessionCurrent({
        currentSessionId: voicePreviewSessionRef.current,
        previewSessionId,
        currentAbortController: voicePreviewAbortRef.current,
        expectedAbortController: controller,
      })) {
        voicePreviewAbortRef.current = null;
        setVoicePreviewLoading(false);
      }
    }
  }, [handleStopVoicePreview, selectedTypecastEmotionType, selectedTypecastSpeed, selectedVoiceId]);

  const handlePreviewVoice = useCallback(async () => {
    await previewVoiceText(DEFAULT_VOICE_PREVIEW_TEXT);
  }, [previewVoiceText]);

  useEffect(() => {
    return () => {
      handleStopVoicePreview();
    };
  }, [handleStopVoicePreview]);

  return {
    voicePreviewLoading,
    voicePreviewPlaying,
    handlePreviewVoice,
    previewVoiceText,
    handleStopVoicePreview,
  };
}
