import assert from "node:assert/strict";
import test from "node:test";
import {
  createStudioVoicePreviewPlaybackController,
  isStudioVoicePreviewSessionCurrent,
  resolveStudioDialoguePreviewVoiceId,
  resolveStudioVoicePreviewPlaybackWindow,
  resolveStudioVoicePreviewSpeed,
  resolveStudioVoicePreviewTimeline,
  type StudioVoicePreviewAudioLike,
} from "./use-studio-voice-preview";

class FakeVoicePreviewAudio implements StudioVoicePreviewAudioLike {
  currentTime = 0;
  readyState = 1;
  preload = "";
  volume = 0;
  onended: ((event: Event) => unknown) | null = null;
  onerror: ((event: Event) => unknown) | null = null;
  ontimeupdate: ((event: Event) => unknown) | null = null;
  pauseCount = 0;
  playCount = 0;
  loadCount = 0;
  listeners: Array<{ type: string; listener: () => void; once?: boolean }> = [];

  addEventListener(type: string, listener: () => void, options?: { once?: boolean }) {
    this.listeners.push({ type, listener, once: options?.once });
  }

  load() {
    this.loadCount += 1;
  }

  pause() {
    this.pauseCount += 1;
  }

  async play() {
    this.playCount += 1;
  }
}

function createFakeTimerHarness() {
  let nextTimerId = 1;
  const timers: Array<{ id: number; callback: () => void; delayMs: number; cleared: boolean }> = [];
  return {
    timers,
    scheduleTimer(callback: () => void, delayMs: number) {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.push({ id, callback, delayMs, cleared: false });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer(handle: ReturnType<typeof setTimeout>) {
      const row = timers.find((timer) => timer.id === (handle as unknown as number));
      if (row) row.cleared = true;
    },
    fire(id: number) {
      const row = timers.find((timer) => timer.id === id);
      if (!row || row.cleared) return;
      row.callback();
    },
  };
}

function createControllerHarness(input?: {
  isCurrent?: () => boolean;
  onComplete?: () => void;
  blobUrl?: string;
}) {
  const audio = new FakeVoicePreviewAudio();
  const timerHarness = createFakeTimerHarness();
  const revokedUrls: string[] = [];
  let completeCount = 0;
  const controller = createStudioVoicePreviewPlaybackController({
    audio,
    blobUrl: input?.blobUrl || "blob:voice-preview",
    timeline: {
      trimStartMs: 0,
      trimEndMs: 700,
      speechDurationMs: 700,
    },
    isCurrent: input?.isCurrent || (() => true),
    onComplete: input?.onComplete || (() => {
      completeCount += 1;
    }),
    revokeObjectUrl: (url) => {
      revokedUrls.push(url);
    },
    scheduleTimer: timerHarness.scheduleTimer,
    clearTimer: timerHarness.clearTimer,
  });
  return { audio, controller, revokedUrls, timerHarness, get completeCount() { return completeCount; } };
}

test("resolveStudioVoicePreviewSpeed gives a sentence override priority over the global speed", () => {
  assert.equal(resolveStudioVoicePreviewSpeed("1.1", 1.35), 1.35);
  assert.equal(resolveStudioVoicePreviewSpeed("1.1"), 1.1);
  assert.equal(resolveStudioVoicePreviewSpeed("", undefined), undefined);
});

test("resolveStudioDialoguePreviewVoiceId follows segment, speaker, narration priority", () => {
  const base = {
    segmentType: "quote" as const,
    speakerId: "female_1",
    speakerVoices: [
      { speakerId: "female_1", voiceId: "speaker-voice" },
    ],
    narrationVoiceId: "narration-voice",
    quoteVoiceId: "quote-voice",
    femaleVoiceId: "female-default",
  };

  assert.equal(
    resolveStudioDialoguePreviewVoiceId({ ...base, segmentVoiceId: "segment-voice" }),
    "segment-voice"
  );
  assert.equal(resolveStudioDialoguePreviewVoiceId(base), "speaker-voice");
  assert.equal(
    resolveStudioDialoguePreviewVoiceId({ ...base, speakerVoices: [] }),
    "female-default"
  );
  assert.equal(
    resolveStudioDialoguePreviewVoiceId({ ...base, speakerId: "unknown_1" }),
    "quote-voice"
  );
  assert.equal(
    resolveStudioDialoguePreviewVoiceId({ ...base, segmentType: "narration", speakerVoices: [] }),
    "narration-voice"
  );
});

test("resolveStudioVoicePreviewPlaybackWindow uses the render trim metadata", () => {
  assert.deepEqual(
    resolveStudioVoicePreviewPlaybackWindow({ trimStartMs: 0, trimEndMs: 830, durationMs: 830 }),
    { trimStartMs: 0, trimEndMs: 830, playbackDurationMs: 830 }
  );
  assert.deepEqual(
    resolveStudioVoicePreviewPlaybackWindow({ trimStartMs: 120, durationMs: 700 }),
    { trimStartMs: 120, trimEndMs: 820, playbackDurationMs: 700 }
  );
  assert.equal(resolveStudioVoicePreviewPlaybackWindow({}), null);
});

test("resolveStudioVoicePreviewTimeline plays only the trimmed speech window", () => {
  assert.deepEqual(
    resolveStudioVoicePreviewTimeline({ trimStartMs: 120, durationMs: 700 }),
    { trimStartMs: 120, trimEndMs: 820, speechDurationMs: 700 }
  );
  assert.deepEqual(
    resolveStudioVoicePreviewTimeline({ trimStartMs: 0, trimEndMs: 830, durationMs: 830 }),
    { trimStartMs: 0, trimEndMs: 830, speechDurationMs: 830 }
  );
  assert.equal(resolveStudioVoicePreviewTimeline({}), null);
});

test("voice preview controller completes when the trimmed speech ends", async () => {
  const harness = createControllerHarness();

  assert.equal(await harness.controller.start(), true);
  assert.equal(harness.timerHarness.timers[0]?.delayMs, 700);
  harness.audio.onended?.(new Event("ended"));

  assert.equal(harness.completeCount, 1);
  assert.deepEqual(harness.revokedUrls, ["blob:voice-preview"]);
  assert.equal(harness.timerHarness.timers[0]?.cleared, true);
});

test("voice preview controller stop clears timers and revokes the blob exactly once", async () => {
  const harness = createControllerHarness();

  assert.equal(await harness.controller.start(), true);
  const speechTimer = harness.timerHarness.timers.find((timer) => timer.delayMs === 700);
  assert.ok(speechTimer);

  harness.controller.stop();
  harness.controller.stop();

  assert.equal(speechTimer.cleared, true);
  assert.deepEqual(harness.revokedUrls, ["blob:voice-preview"]);
  assert.equal(harness.completeCount, 0);
  assert.equal(harness.audio.currentTime, 0);
});

test("voice preview controller ignores stale audio events and timers", async () => {
  let current = true;
  const harness = createControllerHarness({ isCurrent: () => current });

  assert.equal(await harness.controller.start(), true);
  current = false;
  harness.audio.onended?.(new Event("ended"));
  harness.audio.onerror?.(new Event("error"));
  for (const timer of harness.timerHarness.timers) {
    harness.timerHarness.fire(timer.id);
  }

  assert.equal(harness.completeCount, 0);
  assert.deepEqual(harness.revokedUrls, []);
});

test("new voice preview controller replacement leaves old controller unable to complete newer session", async () => {
  let activeController: ReturnType<typeof createStudioVoicePreviewPlaybackController> | null = null;
  let oldCompleteCount = 0;
  let newCompleteCount = 0;
  const oldHarness = createControllerHarness({
    isCurrent: () => activeController === oldHarness.controller,
    onComplete: () => {
      oldCompleteCount += 1;
    },
    blobUrl: "blob:old",
  });
  activeController = oldHarness.controller;
  assert.equal(await oldHarness.controller.start(), true);

  const newHarness = createControllerHarness({
    isCurrent: () => activeController === newHarness.controller,
    onComplete: () => {
      newCompleteCount += 1;
    },
    blobUrl: "blob:new",
  });
  oldHarness.controller.stop();
  activeController = newHarness.controller;
  assert.equal(await newHarness.controller.start(), true);

  oldHarness.audio.onended?.(new Event("ended"));
  oldHarness.audio.onerror?.(new Event("error"));
  newHarness.audio.onended?.(new Event("ended"));

  assert.equal(oldCompleteCount, 0);
  assert.equal(newCompleteCount, 1);
  assert.deepEqual(oldHarness.revokedUrls, ["blob:old"]);
  assert.deepEqual(newHarness.revokedUrls, ["blob:new"]);
});

test("voice preview pending request session guard rejects stopped or replaced sessions", () => {
  const requestA = new AbortController();
  const requestB = new AbortController();

  assert.equal(isStudioVoicePreviewSessionCurrent({ currentSessionId: 3, previewSessionId: 3 }), true);
  assert.equal(isStudioVoicePreviewSessionCurrent({ currentSessionId: 4, previewSessionId: 3 }), false);
  assert.equal(
    isStudioVoicePreviewSessionCurrent({
      currentSessionId: 3,
      previewSessionId: 3,
      currentAbortController: requestB,
      expectedAbortController: requestA,
    }),
    false
  );
  assert.equal(
    isStudioVoicePreviewSessionCurrent({
      currentSessionId: 3,
      previewSessionId: 3,
      currentAbortController: requestA,
      expectedAbortController: requestA,
    }),
    true
  );
});
