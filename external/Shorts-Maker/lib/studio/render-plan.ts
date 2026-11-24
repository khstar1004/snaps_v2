import type { PreparedSlide, RenderPlan } from "@/types/studio-json";

type ResolvedCueCandidate = {
  lineId: string;
  frameIndex: number;
  groupId: number;
  tag: string;
  startMs: number;
  gainDb?: number;
  offsetMs?: number;
  source?: "auto" | "manual";
};

export function buildRenderPlanV2(frames: PreparedSlide[], frameDurationsSec: number[]): RenderPlan {
  const lines: RenderPlan["lines"] = [];
  const planFrames: RenderPlan["frames"] = [];
  const sfxCuesResolved: RenderPlan["sfxCuesResolved"] = [];
  const groupedCueCandidates = new Map<number, ResolvedCueCandidate[]>();
  const groupOrder: number[] = [];
  let lastResolvedTag = "";
  let timelineCursorMs = 0;

  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    const durationMs = Math.max(1, Math.round((Number(frameDurationsSec[i]) || 0) * 1000));
    const startMs = timelineCursorMs;
    const endMs = startMs + durationMs;
    timelineCursorMs = endMs;

    const groupId = Number.isFinite(frame.groupId) ? Number(frame.groupId) : i;
    const stepIndex = Number.isFinite(frame.stepIndex) ? Number(frame.stepIndex) : 0;
    const lineIndex = stepIndex;
    const lineId = `${groupId}:${lineIndex}`;
    const text = (frame.text || "").trim() || frame.lines.join(" ").trim() || " ";

    lines.push({
      lineId,
      groupId,
      lineIndex,
      stepIndex,
      text,
      startMs,
      endMs,
    });

    planFrames.push({
      frameIndex: i,
      lineId,
      groupId,
      stepIndex,
      startMs,
      endMs,
    });

    const explicitCue = frame.sfxCue;
    const explicitTag = String(explicitCue?.tag || "").trim();
    const hasExplicitCue = Boolean(explicitCue && explicitTag);
    const matchedPlanCue = hasExplicitCue
      ? null
      : (Array.isArray(frame.sfxPlan)
          ? frame.sfxPlan.find((item) => Number.isFinite(item?.lineIndex) && Number(item.lineIndex) === stepIndex)
          : null);
    const cue = hasExplicitCue
      ? explicitCue
      : matchedPlanCue
        ? {
            enabled: matchedPlanCue.enabled !== false,
            tag: matchedPlanCue.tag,
            gainDb: matchedPlanCue.gainDb,
            offsetMs: matchedPlanCue.offsetMs,
            source: matchedPlanCue.source || ("auto" as const),
          }
        : null;
    const tag = String(cue?.tag || "").trim();
    if (!cue || cue.enabled === false || !tag) continue;
    const cueSource = cue.source === "auto" ? "auto" : cue.source === "manual" ? "manual" : undefined;
    const offsetMs = Number.isFinite(cue.offsetMs) ? Math.max(-1200, Math.min(1200, Math.floor(Number(cue.offsetMs)))) : 0;
    const gainDb = Number.isFinite(cue.gainDb) ? Math.max(-24, Math.min(12, Number(cue.gainDb))) : undefined;
    if (!groupedCueCandidates.has(groupId)) {
      groupedCueCandidates.set(groupId, []);
      groupOrder.push(groupId);
    }
    groupedCueCandidates.get(groupId)?.push({
      frameIndex: i,
      groupId,
      lineId,
      tag,
      startMs: Math.max(0, startMs + offsetMs),
      gainDb,
      offsetMs,
      source: cueSource,
    });
  }

  for (const groupId of groupOrder) {
    const groupCandidates = groupedCueCandidates.get(groupId) || [];
    const acceptedGroupCues: ResolvedCueCandidate[] = [];
    let fallbackCandidate: ResolvedCueCandidate | null = null;

    for (const candidate of groupCandidates) {
      const isAutoCue = candidate.source === "auto";
      if (!isAutoCue) {
        acceptedGroupCues.push(candidate);
        lastResolvedTag = candidate.tag;
        continue;
      }
      if (!fallbackCandidate) fallbackCandidate = candidate;
      if (acceptedGroupCues.length >= 2) continue;
      if (candidate.tag === lastResolvedTag) continue;
      acceptedGroupCues.push(candidate);
      lastResolvedTag = candidate.tag;
    }

    if (acceptedGroupCues.length <= 0 && fallbackCandidate) {
      acceptedGroupCues.push(fallbackCandidate);
      lastResolvedTag = fallbackCandidate.tag;
    }

    for (const candidate of acceptedGroupCues) {
      sfxCuesResolved.push({
        cueId: `${candidate.lineId}:${sfxCuesResolved.length + 1}`,
        lineId: candidate.lineId,
        frameIndex: candidate.frameIndex,
        tag: candidate.tag,
        startMs: candidate.startMs,
        gainDb: candidate.gainDb,
        offsetMs: candidate.offsetMs,
        source: candidate.source,
      });
    }
  }

  return {
    version: 2,
    lines,
    frames: planFrames,
    sfxCuesResolved,
  };
}
