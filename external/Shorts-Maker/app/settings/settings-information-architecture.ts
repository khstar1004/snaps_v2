export const PERSONAL_V1_SETTINGS_TABS = ["contentProfile", "connections", "templateOutput", "storageRecovery", "advanced"] as const;

export type PersonalV1SettingsTab = (typeof PERSONAL_V1_SETTINGS_TABS)[number];

export type PersonalV1SettingsLink = {
  readonly label: string;
  readonly href: string;
  readonly telemetryDetail: string;
  readonly exposure: "standard" | "advanced";
};

export type PersonalV1SettingsSection = {
  readonly id: PersonalV1SettingsTab;
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly summary: readonly string[];
  readonly links: readonly PersonalV1SettingsLink[];
};

export const PERSONAL_V1_SETTINGS_SECTIONS: readonly PersonalV1SettingsSection[] = [
  {
    id: "contentProfile",
    label: "콘텐츠 프로필",
    title: "콘텐츠 프로필 기본값",
    description: "새 프로젝트를 시작할 때 복사되는 프로필별 제작 기본값을 관리합니다.",
    summary: [
      "이름과 현재 대응 채널",
      "화자·Typecast 보이스·배속·무음 정책",
      "이미지 스타일, 캐릭터, 자막·BGM·SFX 기본값",
    ],
    links: [],
  },
  {
    id: "connections",
    label: "외부 연결",
    title: "외부 연결",
    description: "Codex 구독 연결과 Typecast 보이스 연결 상태를 확인합니다.",
    summary: ["Codex ChatGPT 구독 연결 상태", "Typecast 연결과 보이스 새로고침", "제작 단계에서 필요한 연결 문제만 강조"],
    links: [],
  },
  {
    id: "templateOutput",
    label: "템플릿·출력",
    title: "템플릿·출력 기본값",
    description: "공유 템플릿, 출력 규격, 렌더 기본값을 관리합니다.",
    summary: ["공유 템플릿 목록", "출력 규격과 렌더 기본값", "템플릿 복제·관리"],
    links: [
      {
        label: "템플릿 관리 열기",
        href: "/shorts-json-studio/template-manager",
        telemetryDetail: "open_template_manager",
        exposure: "standard",
      },
    ],
  },
  {
    id: "storageRecovery",
    label: "저장소·복구",
    title: "저장소·복구",
    description: "로컬 저장 위치, 자동 저장, 백업, 삭제 항목 복구를 관리합니다.",
    summary: ["프로젝트 저장 위치", "완성 영상 저장 위치", "자동 저장·백업 상태와 버전 복구"],
    links: [
      {
        label: "저장 이력 복구 열기",
        href: "/settings/history",
        telemetryDetail: "open_settings_history",
        exposure: "standard",
      },
    ],
  },
  {
    id: "advanced",
    label: "고급",
    title: "고급 도구",
    description: "좌표 편집, raw JSON, 전역 렌더 진단처럼 명시적으로 열어야 하는 도구만 둡니다.",
    summary: ["고급 레이아웃 편집", "템플릿 JSON·좌표 확인", "전역 렌더 환경 진단과 내부 도구"],
    links: [
      {
        label: "고급 레이아웃 편집",
        href: "/layout-studio",
        telemetryDetail: "open_advanced_layout_studio",
        exposure: "advanced",
      },
    ],
  },
];

export function getPersonalV1SettingsSection(tab: PersonalV1SettingsTab): PersonalV1SettingsSection {
  return PERSONAL_V1_SETTINGS_SECTIONS.find((section) => section.id === tab) || PERSONAL_V1_SETTINGS_SECTIONS[0];
}

export function isPersonalV1SettingsTab(value: string): value is PersonalV1SettingsTab {
  return PERSONAL_V1_SETTINGS_TABS.includes(value as PersonalV1SettingsTab);
}

export function getPersonalV1SettingsTabFromSearch(search: string): PersonalV1SettingsTab {
  const value = new URLSearchParams(search).get("tab") || "";
  return isPersonalV1SettingsTab(value) ? value : "contentProfile";
}

export function buildPersonalV1SettingsHref(tab: PersonalV1SettingsTab): string {
  return `/settings?tab=${encodeURIComponent(tab)}`;
}

export function buildCanonicalPersonalV1SettingsHref(search: string): string {
  const params = new URLSearchParams(search);
  params.set("tab", getPersonalV1SettingsTabFromSearch(search));
  return `/settings?${params.toString()}`;
}
