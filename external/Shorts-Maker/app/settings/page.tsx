"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { disconnectStudioCodexOauth, fetchStudioCodexStatus } from "@/lib/api/studio-client";
import { trackWorkflowEvent } from "@/lib/telemetry/client";
import {
  buildCanonicalPersonalV1SettingsHref,
  buildPersonalV1SettingsHref,
  getPersonalV1SettingsSection,
  getPersonalV1SettingsTabFromSearch,
  PERSONAL_V1_SETTINGS_SECTIONS,
  type PersonalV1SettingsTab,
} from "./settings-information-architecture";

const StudioTtsSettingsManager = dynamic(
  () => import("@/components/studio-tts-settings-manager").then((module) => module.StudioTtsSettingsManager),
  {
    ssr: false,
    loading: () => (
      <section className="card studio-tts-settings-manager">
        <h2 className="studio-tts-panel-title">TTS 설정</h2>
        <div className="studio-tts-helper-text">설정을 불러오는 중입니다.</div>
      </section>
    ),
  }
);

const ContentProfileSettingsManager = dynamic(
  () => import("./content-profile-settings-manager").then((module) => module.ContentProfileSettingsManager),
  {
    ssr: false,
    loading: () => (
      <section className="card page-section-card">
        <div className="settings-flow-callout">콘텐츠 프로필 설정을 불러오는 중입니다.</div>
      </section>
    ),
  }
);

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<PersonalV1SettingsTab>("contentProfile");
  const [hasResolvedInitialTab, setHasResolvedInitialTab] = useState(false);
  const [hasOpenedTtsTab, setHasOpenedTtsTab] = useState(false);
  const [codexConnected, setCodexConnected] = useState(false);
  const [codexLocalReady, setCodexLocalReady] = useState(false);
  const [codexMode, setCodexMode] = useState<"oauth" | "local_codex_bridge">("local_codex_bridge");
  const [codexStatusLoading, setCodexStatusLoading] = useState(false);
  const [codexStatusMessage, setCodexStatusMessage] = useState("");
  const activeSection = getPersonalV1SettingsSection(activeTab);

  const handleSettingsTabChange = useCallback((tab: PersonalV1SettingsTab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", buildPersonalV1SettingsHref(tab));
    }
  }, []);

  const refreshCodexStatus = useCallback(async () => {
    setCodexStatusLoading(true);
    setCodexStatusMessage("");
    try {
      const status = await fetchStudioCodexStatus();
      if (!status.ok) throw new Error("Codex 연결 상태를 확인하지 못했습니다.");
      setCodexConnected(status.connected === true);
      setCodexLocalReady(status.localReady === true);
      setCodexMode(status.mode === "oauth" ? "oauth" : "local_codex_bridge");
    } catch (error) {
      setCodexConnected(false);
      setCodexLocalReady(false);
      setCodexStatusMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCodexStatusLoading(false);
    }
  }, []);

  const handleDisconnectCodex = useCallback(async () => {
    setCodexStatusLoading(true);
    setCodexStatusMessage("");
    try {
      if (!(await disconnectStudioCodexOauth())) throw new Error("Codex 연결을 해제하지 못했습니다.");
      await refreshCodexStatus();
    } catch (error) {
      setCodexStatusMessage(error instanceof Error ? error.message : String(error));
      setCodexStatusLoading(false);
    }
  }, [refreshCodexStatus]);

  useEffect(() => {
    trackWorkflowEvent({
      name: "page_view",
      page: "settings",
      stage: "settings",
      status: "success",
    });
    const initialTab = getPersonalV1SettingsTabFromSearch(window.location.search);
    const canonicalHref = buildCanonicalPersonalV1SettingsHref(window.location.search);
    setActiveTab(initialTab);
    if (`${window.location.pathname}${window.location.search}` !== canonicalHref) {
      window.history.replaceState(window.history.state, "", `${canonicalHref}${window.location.hash}`);
    }
    setHasResolvedInitialTab(true);
  }, []);

  useEffect(() => {
    if (activeTab === "connections") {
      setHasOpenedTtsTab(true);
      void refreshCodexStatus();
    }
  }, [activeTab, refreshCodexStatus]);

  return (
    <AppLayout>
      <div className="settings-page-stack">
        <section className="card settings-hero-card">
          <div className="settings-hero-copy">
            <h1 className="settings-page-title">설정</h1>
            <p className="settings-page-description">콘텐츠 프로필, 외부 연결, 템플릿, 저장소와 고급 도구를 목적별로 관리합니다.</p>
          </div>
          <div className="settings-tab-row" aria-label="설정 섹션">
            {PERSONAL_V1_SETTINGS_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                aria-pressed={activeTab === section.id}
                className={`settings-tab-button ${activeTab === section.id ? "is-active" : ""}`}
                onClick={() => handleSettingsTabChange(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>
        </section>

        <section className="card settings-section-card">
          <div className="settings-menu-card-head">
            <div>
              <h2>{activeSection.title}</h2>
              <p className="settings-page-description">{activeSection.description}</p>
            </div>
            {activeSection.id === "advanced" ? <span className="settings-menu-badge">명시적으로 열 때만 사용</span> : null}
          </div>

          <div className="settings-card-grid">
            {activeSection.summary.map((item) => (
              <article key={item} className="settings-menu-card">
                <div className="settings-menu-card-head">
                  <strong>{item}</strong>
                </div>
                <p>이 항목은 새 프로젝트의 기본값 또는 로컬 제작 환경에만 적용됩니다.</p>
              </article>
            ))}
          </div>

          {activeSection.links.length > 0 ? (
            <div className="settings-actions-row">
              {activeSection.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={link.exposure === "advanced" ? "btn-secondary" : "btn-primary"}
                  onClick={() =>
                    trackWorkflowEvent({
                      name: "settings_menu_opened",
                      page: "settings",
                      stage: "settings",
                      status: "success",
                      detail: link.telemetryDetail,
                    })
                  }
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ) : null}

          {activeSection.id === "contentProfile" ? (
            <div className="settings-flow-callout">프로필 수정은 새 프로젝트 기본값에만 적용됩니다. 기존 프로젝트는 프로젝트 설정에서 명시적으로 반영합니다.</div>
          ) : null}

          {activeSection.id === "templateOutput" ? (
            <div className="settings-flow-callout">좌표·JSON 편집은 고급 탭에서만 엽니다. 여기서는 템플릿 선택과 출력 기본값만 다룹니다.</div>
          ) : null}

          {activeSection.id === "storageRecovery" ? (
            <div className="settings-flow-callout">복구 화면은 콘텐츠 프로필별 메타데이터와 브랜딩 저장 이력을 기준으로 표시합니다.</div>
          ) : null}

          {activeSection.id === "advanced" ? (
            <div className="settings-flow-callout">고급 도구는 제작 기본 흐름에 노출하지 않고, 필요할 때 이 탭에서만 진입합니다.</div>
          ) : null}
        </section>

        {hasResolvedInitialTab && activeTab === "contentProfile" ? <ContentProfileSettingsManager /> : null}

        {activeTab === "connections" ? (
          <section className="card settings-section-card">
            <div className="settings-menu-card-head">
              <div>
                <h2>Codex 구독 연결</h2>
                <p className="settings-page-description">대본, 이미지, 효과음 계획에 사용하는 로컬 Codex 연결 상태입니다.</p>
              </div>
              <span className="settings-menu-badge">
                {codexStatusLoading ? "확인 중" : codexConnected ? "연결됨" : "연결 필요"}
              </span>
            </div>
            <div className="settings-flow-callout" role="status" aria-live="polite">
              {codexStatusMessage ||
                (codexConnected
                  ? codexLocalReady
                    ? "이 PC의 Codex 구독 로그인을 사용합니다. API 키를 별도로 입력하지 않습니다."
                    : "Codex OAuth 연결을 사용합니다."
                  : "Codex 로그인이 필요합니다. 연결 후 이 화면으로 돌아와 상태를 다시 확인하세요.")}
            </div>
            <div className="settings-actions-row">
              <a href={`/api/auth/codex/start?next=${encodeURIComponent(buildPersonalV1SettingsHref("connections"))}`} className="btn-primary">
                {codexConnected ? "Codex 연결 갱신" : "Codex 연결"}
              </a>
              <button type="button" className="btn-secondary" onClick={() => void refreshCodexStatus()} disabled={codexStatusLoading}>
                상태 새로고침
              </button>
              {codexConnected && codexMode === "oauth" && !codexLocalReady ? (
                <button type="button" className="btn-secondary" onClick={() => void handleDisconnectCodex()} disabled={codexStatusLoading}>
                  연결 해제
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {hasOpenedTtsTab ? (
          <div hidden={activeTab !== "connections"} aria-hidden={activeTab !== "connections"}>
            <StudioTtsSettingsManager />
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
