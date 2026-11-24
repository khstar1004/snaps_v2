import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toStudioFailureResponse } from "@/lib/studio/error-response";
import { seedMemeLibraryFromGiphy } from "@/lib/studio/image-provider-resolver";
import { countMemeLibraryByEmotionTag, inferMemeEmotionTags } from "@/lib/studio/meme-library";

export const runtime = "nodejs";

const DEFAULT_MEME_SEED_PRESETS: Array<{ key: string; queries: string[] }> = [
  { key: "embarrassed", queries: ["민망 reaction", "뻘쭘 reaction"] },
  { key: "flustered", queries: ["당황 reaction", "허둥 reaction"] },
  { key: "speechless", queries: ["어이없음 reaction", "정색 reaction"] },
  { key: "facepalm", queries: ["답답 reaction", "facepalm reaction"] },
  { key: "mental_break", queries: ["멘붕 reaction", "mental breakdown reaction"] },
  { key: "empty", queries: ["현타 reaction", "허탈 reaction"] },
  { key: "wronged", queries: ["억울함 reaction", "wronged reaction"] },
  { key: "furious", queries: ["분노 reaction", "rage reaction"] },
  { key: "crying", queries: ["눈물 reaction", "crying reaction"] },
  { key: "smug", queries: ["우쭐 reaction", "smug reaction"] },
  { key: "winning", queries: ["뿌듯 reaction", "winning reaction"] },
  { key: "shocked", queries: ["충격 reaction", "shocked reaction"] },
];

const DEFAULT_MEME_SEED_QUERIES = DEFAULT_MEME_SEED_PRESETS.flatMap((preset) => preset.queries);

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function asFiniteNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseSeedRequest(body: unknown): {
  queries: string[];
  limitPerQuery: number;
  providerTimeBudgetMs?: number;
  mode: "all" | "smart";
  minCountPerEmotionTag: number;
} {
  const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const queries = asStringArray(row.queries);
  const limitPerQueryRaw = asFiniteNumber(row.limitPerQuery);
  const providerTimeBudgetMsRaw = asFiniteNumber(row.providerTimeBudgetMs);
  const modeRaw = typeof row.mode === "string" ? row.mode.trim().toLowerCase() : "";
  const minCountPerEmotionTagRaw = asFiniteNumber(row.minCountPerEmotionTag);
  return {
    queries: queries.length > 0 ? queries.slice(0, 24) : DEFAULT_MEME_SEED_QUERIES,
    limitPerQuery:
      limitPerQueryRaw !== null ? Math.max(1, Math.min(25, Math.floor(limitPerQueryRaw))) : 8,
    providerTimeBudgetMs:
      providerTimeBudgetMsRaw !== null
        ? Math.max(500, Math.min(30_000, Math.floor(providerTimeBudgetMsRaw)))
        : undefined,
    mode: modeRaw === "all" ? "all" : "smart",
    minCountPerEmotionTag:
      minCountPerEmotionTagRaw !== null ? Math.max(1, Math.min(50, Math.floor(minCountPerEmotionTagRaw))) : 12,
  };
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const payload = parseSeedRequest(body);
    const currentCounts = await countMemeLibraryByEmotionTag({ userScope: user.id });
    const selectedPresets =
      payload.mode === "all"
        ? DEFAULT_MEME_SEED_PRESETS
        : DEFAULT_MEME_SEED_PRESETS.filter((preset) => (currentCounts[preset.key] || 0) < payload.minCountPerEmotionTag);
    const selectedQueries =
      asStringArray((body as Record<string, unknown>)?.queries).length > 0
        ? payload.queries
        : selectedPresets.flatMap((preset) => preset.queries);
    const result = await seedMemeLibraryFromGiphy({
      queries: selectedQueries,
      limitPerQuery: payload.limitPerQuery,
      providerTimeBudgetMs: payload.providerTimeBudgetMs,
      userScope: user.id,
    });
    const nextCounts = await countMemeLibraryByEmotionTag({ userScope: user.id });
    const byEmotionTag: Record<string, { queryCount: number; addedCount: number; skippedExistingCount: number }> = {};
    for (const row of result.results) {
      const tags = inferMemeEmotionTags([row.query]);
      for (const tag of tags) {
        if (!byEmotionTag[tag]) {
          byEmotionTag[tag] = {
            queryCount: 0,
            addedCount: 0,
            skippedExistingCount: 0,
          };
        }
        byEmotionTag[tag].queryCount += 1;
        byEmotionTag[tag].addedCount += row.addedCount;
        byEmotionTag[tag].skippedExistingCount += row.skippedExistingCount;
      }
    }
    return NextResponse.json({
      ok: true,
      seeded: result,
      mode: payload.mode,
      selectedPresetKeys: selectedPresets.map((preset) => preset.key),
      selectedQueries,
      minCountPerEmotionTag: payload.minCountPerEmotionTag,
      libraryCountsBefore: currentCounts,
      libraryCountsAfter: nextCounts,
      byEmotionTag,
      defaultPresets: DEFAULT_MEME_SEED_PRESETS,
      defaultQueries: DEFAULT_MEME_SEED_QUERIES,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toStudioFailureResponse(message, "INVALID_MEME_LIBRARY_SEED_INPUT", "MEME_LIBRARY_SEED_FAILED");
  }
}
