"use client";

import type {
  PublishAccountSummary,
  PublishAnalyticsCategoryInsight,
  PublishAnalyticsSummary,
  PublishAnalyticsStrategyPayload,
  PublishAnalyticsTimingInsight,
  PublishAnalyticsVideoInsight,
} from "@/lib/publish/client-types";

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(value));
}

function formatSignedDelta(value: number, digits = 1): string {
  const rounded = Number.isFinite(value) ? value : 0;
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${rounded.toFixed(digits)}`;
}

type PublishAnalyticsPanelProps = {
  accounts: PublishAccountSummary[];
  analyticsChannelId: string;
  analyticsChannelTitle: string;
  analyticsLoading: boolean;
  analyticsError: string;
  analyticsSummary: PublishAnalyticsSummary | undefined;
  analyticsCategoryInsights: PublishAnalyticsCategoryInsight[];
  analyticsTimingInsights: PublishAnalyticsTimingInsight[];
  analyticsVideoLeaders: PublishAnalyticsVideoInsight[];
  analyticsVideoRisks: PublishAnalyticsVideoInsight[];
  analyticsRecommendations: string[];
  strategyLoading: boolean;
  strategyError: string;
  strategyData: PublishAnalyticsStrategyPayload | null;
  strategyModel: string;
  youtubeAuthUrl: string;
  onAnalyticsChannelChangeAction: (channelId: string) => void;
  onRefreshAnalyticsAction: () => void;
  onGenerateStrategyAction: () => void;
};

export function PublishAnalyticsPanel({
  accounts,
  analyticsChannelId,
  analyticsChannelTitle,
  analyticsLoading,
  analyticsError,
  analyticsSummary,
  analyticsCategoryInsights,
  analyticsTimingInsights,
  analyticsVideoLeaders,
  analyticsVideoRisks,
  analyticsRecommendations,
  strategyLoading,
  strategyError,
  strategyData,
  strategyModel,
  youtubeAuthUrl,
  onAnalyticsChannelChangeAction,
  onRefreshAnalyticsAction,
  onGenerateStrategyAction,
}: PublishAnalyticsPanelProps) {
  return (
    <section className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginBottom: "var(--space-1)" }}>성장 인사이트</h2>
          <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
            최근 28일 기준 · 분석 채널:{" "}
            <strong style={{ color: "var(--text-primary)" }}>{analyticsChannelTitle || "채널 없음"}</strong>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <select
            className="input-field"
            style={{ minWidth: "220px" }}
            value={analyticsChannelId}
            disabled={accounts.length <= 0}
            onChange={(event) => onAnalyticsChannelChangeAction(event.target.value)}
          >
            {accounts.map((item) => (
              <option key={`insight-${item.channelId}`} value={item.channelId}>
                {item.channelTitle} ({item.channelId})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary"
            disabled={analyticsLoading || !analyticsChannelId}
            onClick={onRefreshAnalyticsAction}
          >
            인사이트 새로고침
          </button>
        </div>
      </div>

      {!analyticsChannelId && (
        <div style={{ fontSize: "0.875rem", color: "var(--error)" }}>
          연결된 채널이 없습니다. <a href={youtubeAuthUrl} style={{ textDecoration: "underline" }}>YouTube 채널 연결</a> 후 다시 시도해 주세요.
        </div>
      )}

      {analyticsLoading && (
        <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>인사이트를 불러오는 중입니다...</div>
      )}

      {analyticsError && (
        <div style={{ padding: "var(--space-3)", borderRadius: "var(--radius-md)", background: "#FEF2F2", color: "#B91C1C", fontSize: "0.875rem" }}>
          {analyticsError}
        </div>
      )}

      {analyticsSummary && (
        <>
          <div style={{ display: "grid", gap: "var(--space-3)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <article style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>조회수</div>
              <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{formatNumber(analyticsSummary.views.current)}</div>
              <div style={{ fontSize: "0.8rem", color: analyticsSummary.views.delta >= 0 ? "var(--success)" : "var(--error)" }}>
                {formatSignedDelta(analyticsSummary.views.delta, 0)} / 이전기간
              </div>
            </article>
            <article style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>시청시간(분)</div>
              <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{formatNumber(analyticsSummary.watchMinutes.current)}</div>
              <div style={{ fontSize: "0.8rem", color: analyticsSummary.watchMinutes.delta >= 0 ? "var(--success)" : "var(--error)" }}>
                {formatSignedDelta(analyticsSummary.watchMinutes.delta, 0)} / 이전기간
              </div>
            </article>
            <article style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>평균 시청지속시간(초)</div>
              <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{analyticsSummary.avgViewDurationSec.current.toFixed(1)}</div>
              <div style={{ fontSize: "0.8rem", color: analyticsSummary.avgViewDurationSec.delta >= 0 ? "var(--success)" : "var(--error)" }}>
                {formatSignedDelta(analyticsSummary.avgViewDurationSec.delta, 1)} / 이전기간
              </div>
            </article>
            <article style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>평균 시청률(%)</div>
              <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{analyticsSummary.avgViewPercentage.current.toFixed(1)}</div>
              <div style={{ fontSize: "0.8rem", color: analyticsSummary.avgViewPercentage.delta >= 0 ? "var(--success)" : "var(--error)" }}>
                {formatSignedDelta(analyticsSummary.avgViewPercentage.delta, 1)} / 이전기간
              </div>
            </article>
            <article style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>구독자 순증</div>
              <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{formatNumber(analyticsSummary.subscribersNet.current)}</div>
              <div style={{ fontSize: "0.8rem", color: analyticsSummary.subscribersNet.delta >= 0 ? "var(--success)" : "var(--error)" }}>
                {formatSignedDelta(analyticsSummary.subscribersNet.delta, 0)} / 이전기간
              </div>
            </article>
          </div>

          <div style={{ display: "grid", gap: "var(--space-3)", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            <article style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
              <strong style={{ fontSize: "0.9rem" }}>카테고리 성과 TOP</strong>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                {analyticsCategoryInsights.slice(0, 3).map((item) => (
                  <div key={item.category} style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{item.category}</span>
                    {" · "}조회수 {formatNumber(item.views)}
                    {" · "}시청률 {item.avgViewPercentage.toFixed(1)}%
                  </div>
                ))}
                {analyticsCategoryInsights.length <= 0 && (
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>아직 카테고리별 분석 데이터가 없습니다.</div>
                )}
              </div>
            </article>

            <article style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
              <strong style={{ fontSize: "0.9rem" }}>업로드 시간대 추천</strong>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                {analyticsTimingInsights.slice(0, 3).map((item) => (
                  <div key={`${item.weekday}-${item.hour}`} style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{item.slotLabel}</span>
                    {" · "}평균 조회 {formatNumber(item.avgViews)}
                    {" · "}평균 시청률 {item.avgViewPercentage.toFixed(1)}%
                  </div>
                ))}
                {analyticsTimingInsights.length <= 0 && (
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>표본이 부족해 시간대 추천을 계산하지 못했습니다.</div>
                )}
              </div>
            </article>
          </div>

          <div style={{ display: "grid", gap: "var(--space-3)", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            <article style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
              <strong style={{ fontSize: "0.9rem" }}>상위 성과 영상</strong>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                {analyticsVideoLeaders.map((item) => (
                  <div key={item.videoId} style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    <a href={item.url} target="_blank" rel="noreferrer" style={{ color: "var(--text-primary)", fontWeight: 600, textDecoration: "underline" }}>
                      {item.title}
                    </a>
                    {" · "}조회수 {formatNumber(item.views)}
                    {" · "}시청률 {item.avgViewPercentage.toFixed(1)}%
                  </div>
                ))}
                {analyticsVideoLeaders.length <= 0 && (
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>상위 영상 데이터가 없습니다.</div>
                )}
              </div>
            </article>

            <article style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
              <strong style={{ fontSize: "0.9rem" }}>개선 우선 영상</strong>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                {analyticsVideoRisks.map((item) => (
                  <div key={item.videoId} style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    <a href={item.url} target="_blank" rel="noreferrer" style={{ color: "var(--text-primary)", fontWeight: 600, textDecoration: "underline" }}>
                      {item.title}
                    </a>
                    {" · "}시청률 {item.avgViewPercentage.toFixed(1)}%
                    {" · "}점수 {item.score.toFixed(1)}
                  </div>
                ))}
                {analyticsVideoRisks.length <= 0 && (
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>개선 우선 영상이 식별되지 않았습니다.</div>
                )}
              </div>
            </article>
          </div>

          <article style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
            <strong style={{ fontSize: "0.9rem" }}>액션 제안</strong>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
              {analyticsRecommendations.map((item, index) => (
                <div key={item} style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  {index + 1}. {item}
                </div>
              ))}
              {analyticsRecommendations.length <= 0 && (
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>추천 항목이 없습니다.</div>
              )}
            </div>
          </article>

          <article style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <strong style={{ fontSize: "0.9rem" }}>Codex 전략 도출</strong>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                <a href="/api/auth/codex/start?next=/publish" className="btn-secondary" style={{ fontSize: "0.75rem", padding: "6px 10px" }}>
                  Codex 연결/갱신
                </a>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ fontSize: "0.75rem", padding: "6px 10px" }}
                  disabled={strategyLoading}
                  onClick={onGenerateStrategyAction}
                >
                  {strategyLoading ? "전략 생성 중..." : "분석 기반 전략 생성"}
                </button>
              </div>
            </div>

            {strategyError && (
              <div style={{ marginTop: "var(--space-2)", fontSize: "0.85rem", color: "var(--error)" }}>{strategyError}</div>
            )}

            {strategyData && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>진단:</strong> {strategyData.overview}
                  {strategyModel ? ` · model=${strategyModel}` : ""}
                </div>

                <div>
                  <strong style={{ fontSize: "0.85rem" }}>우선 실행 액션</strong>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                    {strategyData.actions.map((item, index) => (
                      <div key={`${item.title}-${index}`} style={{ fontSize: "0.84rem", color: "var(--text-secondary)" }}>
                        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                          {index + 1}. {item.title} ({item.priority})
                        </span>
                        <div>근거: {item.reason}</div>
                        <div>실행: {item.execution}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gap: "var(--space-3)", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                  <div>
                    <strong style={{ fontSize: "0.85rem" }}>다음 업로드 슬롯</strong>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
                    {strategyData.nextUploadSlots.map((item, index) => (
                        <div key={item} style={{ fontSize: "0.84rem", color: "var(--text-secondary)" }}>
                          {index + 1}. {item}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <strong style={{ fontSize: "0.85rem" }}>콘텐츠 아이디어</strong>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
                      {strategyData.contentIdeas.map((item, index) => (
                        <div key={item} style={{ fontSize: "0.84rem", color: "var(--text-secondary)" }}>
                          {index + 1}. {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <strong style={{ fontSize: "0.85rem" }}>주의할 점</strong>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
                    {strategyData.watchouts.map((item, index) => (
                      <div key={item} style={{ fontSize: "0.84rem", color: "var(--text-secondary)" }}>
                        {index + 1}. {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </article>
        </>
      )}
    </section>
  );
}
