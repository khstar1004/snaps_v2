import { runLocalCodexCliPrompt } from "@/lib/auth/codex-local-cli";
import { shouldUseLocalCodexCliBridge } from "@/lib/auth/codex-bridge";
import { requestCodexChatCompletion } from "@/lib/studio/codex-script-transport";
import type {
  PublishAnalyticsCategoryInsight,
  PublishAnalyticsStrategyPayload,
  PublishAnalyticsSummary,
  PublishAnalyticsTimingInsight,
  PublishAnalyticsVideoInsight,
} from "@/lib/publish/client-types";

const DEFAULT_MODEL = (process.env.CODEX_MODEL || "").trim() || "gpt-4.1-mini";

export type AnalyticsSnapshotForStrategy = {
  channelTitle?: string;
  summary?: PublishAnalyticsSummary;
  categoryInsights?: PublishAnalyticsCategoryInsight[];
  timingInsights?: PublishAnalyticsTimingInsight[];
  videoLeaders?: PublishAnalyticsVideoInsight[];
  videoRisks?: PublishAnalyticsVideoInsight[];
  recommendations?: string[];
};

export type GenerateAnalyticsStrategyResult = {
  strategy: PublishAnalyticsStrategyPayload;
  model: string;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractAssistantText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    const textParts = value
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const row = item as Record<string, unknown>;
        return typeof row.text === "string" ? row.text : "";
      })
      .filter(Boolean);
    return textParts.join("\n").trim();
  }
  return "";
}

function extractJsonObjectText(raw: string): string {
  const stripped = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    return stripped;
  }
  return stripped.slice(first, last + 1);
}

function toSafeStringList(value: unknown, max = 6): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => normalizeWhitespace(String(item || "")))
        .filter(Boolean)
    )
  ).slice(0, max);
}

function toPriority(value: unknown): "high" | "medium" | "low" {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return "medium";
}

function parseStrategy(raw: string): PublishAnalyticsStrategyPayload {
  const jsonText = extractJsonObjectText(raw);
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  const overview = normalizeWhitespace(String(parsed.overview || ""));
  const actionsRaw = Array.isArray(parsed.actions) ? parsed.actions : [];
  const actions = actionsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const title = normalizeWhitespace(String(row.title || ""));
      const reason = normalizeWhitespace(String(row.reason || ""));
      const execution = normalizeWhitespace(String(row.execution || ""));
      if (!title || !reason || !execution) return null;
      return {
        title,
        reason,
        execution,
        priority: toPriority(row.priority),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 5);

  return {
    overview: overview || "최근 성과 기준으로 실행 우선순위를 재정렬하세요.",
    actions:
      actions.length > 0
        ? actions
        : [
            {
              title: "상위 성과 포맷 재활용",
              reason: "최근 성과 상위 영상 패턴이 유지되는 구간입니다.",
              execution: "동일 카테고리/길이 범위로 다음 3개 업로드를 A/B 테스트합니다.",
              priority: "high",
            },
          ],
    nextUploadSlots: toSafeStringList(parsed.nextUploadSlots, 4),
    contentIdeas: toSafeStringList(parsed.contentIdeas, 5),
    watchouts: toSafeStringList(parsed.watchouts, 5),
  };
}

function toPrompt(input: AnalyticsSnapshotForStrategy): string {
  const summary = input.summary
    ? {
        windowDays: input.summary.windowDays,
        views: input.summary.views,
        watchMinutes: input.summary.watchMinutes,
        avgViewDurationSec: input.summary.avgViewDurationSec,
        avgViewPercentage: input.summary.avgViewPercentage,
        subscribersNet: input.summary.subscribersNet,
      }
    : null;
  const payload = {
    channelTitle: normalizeWhitespace(String(input.channelTitle || "")),
    summary,
    categoryInsights: Array.isArray(input.categoryInsights) ? input.categoryInsights.slice(0, 6) : [],
    timingInsights: Array.isArray(input.timingInsights) ? input.timingInsights.slice(0, 6) : [],
    videoLeaders: Array.isArray(input.videoLeaders) ? input.videoLeaders.slice(0, 4) : [],
    videoRisks: Array.isArray(input.videoRisks) ? input.videoRisks.slice(0, 4) : [],
    baseRecommendations: Array.isArray(input.recommendations) ? input.recommendations.slice(0, 4) : [],
  };

  return [
    "너는 유튜브 숏츠 성장 컨설턴트다.",
    "입력된 채널 분석 데이터를 기반으로 실행 가능한 개선 방안을 JSON으로 작성한다.",
    "반드시 JSON 객체 하나만 반환한다. 설명문/마크다운/코드블록 금지.",
    "출력 스키마:",
    '{"overview":"한줄 진단","actions":[{"title":"액션명","reason":"근거","execution":"실행 방법","priority":"high|medium|low"}],"nextUploadSlots":["권장 슬롯"],"contentIdeas":["다음 영상 아이디어"],"watchouts":["주의사항"]}',
    "규칙:",
    "- actions는 3~5개.",
    "- 각 action은 데이터 근거가 있어야 하며 실행 문장은 구체적으로 작성.",
    "- nextUploadSlots는 KST 기준 문장 2~4개.",
    "- contentIdeas는 3~5개.",
    "- watchouts는 2~5개.",
    "- 추상적 조언(열심히/꾸준히) 금지.",
    "",
    "[입력 분석 데이터]",
    JSON.stringify(payload),
  ].join("\n");
}

async function generateByApi(input: {
  codexAccessToken: string;
  snapshot: AnalyticsSnapshotForStrategy;
}): Promise<GenerateAnalyticsStrategyResult> {
  const prompt = toPrompt(input.snapshot);
  const completion = await requestCodexChatCompletion({
    accessToken: input.codexAccessToken,
    temperature: 0.2,
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: "Return JSON only." },
      { role: "user", content: prompt },
    ],
  });
  return {
    strategy: parseStrategy(completion.text),
    model: completion.usage.model || DEFAULT_MODEL,
  };
}

async function generateByCli(snapshot: AnalyticsSnapshotForStrategy): Promise<GenerateAnalyticsStrategyResult> {
  const prompt = toPrompt(snapshot);
  const text = await runLocalCodexCliPrompt(prompt, {
    outputPrefix: "codex-analytics-strategy",
    timeoutMs: 1000 * 60 * 3,
    maxBufferBytes: 1024 * 1024 * 8,
  });
  if (!text) {
    throw new Error("Codex CLI 응답이 비어 있습니다.");
  }
  return {
    strategy: parseStrategy(text),
    model: "codex-cli-bridge",
  };
}

export async function generateAnalyticsStrategyByCodex(input: {
  codexAccessToken: string;
  snapshot: AnalyticsSnapshotForStrategy;
}): Promise<GenerateAnalyticsStrategyResult> {
  const token = (input.codexAccessToken || "").trim();
  if (!token) {
    throw new Error("Codex OAuth 토큰이 없습니다.");
  }
  if (shouldUseLocalCodexCliBridge(token)) {
    try {
      return await generateByCli(input.snapshot);
    } catch {
      return generateByApi({
        codexAccessToken: token,
        snapshot: input.snapshot,
      });
    }
  }
  return generateByApi({
    codexAccessToken: token,
    snapshot: input.snapshot,
  });
}
