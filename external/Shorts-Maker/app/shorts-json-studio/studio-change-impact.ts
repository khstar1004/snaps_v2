export type StudioChangeImpactKey = "image" | "preview" | "render";

export type StudioChangeImpactItem = {
  key: StudioChangeImpactKey;
  label: string;
  targetStep: 2 | 3 | 4;
};

export type StudioChangeImpactSummaryInput = {
  imageApprovalRecorded: boolean;
  imageApproved: boolean;
  hasDraftVideo: boolean;
  draftIsCurrent: boolean;
  hasFinalVideo: boolean;
  finalIsCurrent: boolean;
};

export type StudioChangeImpactSummary = {
  items: StudioChangeImpactItem[];
  count: number;
  hasImpacts: boolean;
  description: string;
};

const IMPACT_ITEMS: Record<StudioChangeImpactKey, StudioChangeImpactItem> = {
  image: { key: "image", label: "이미지", targetStep: 2 },
  preview: { key: "preview", label: "자막·오디오", targetStep: 3 },
  render: { key: "render", label: "렌더", targetStep: 4 },
};

export function resolveStudioChangeImpactSummary(input: StudioChangeImpactSummaryInput): StudioChangeImpactSummary {
  const hasRenderedAsset = input.hasDraftVideo || input.hasFinalVideo;
  const imageIsStale = !input.imageApproved && (input.imageApprovalRecorded || hasRenderedAsset);
  const draftIsStale = input.hasDraftVideo && !input.draftIsCurrent;
  const finalIsStale = input.hasFinalVideo && !input.finalIsCurrent;
  const downstreamIsStale = imageIsStale || draftIsStale || finalIsStale;

  const itemKeys: StudioChangeImpactKey[] = [];
  if (imageIsStale) itemKeys.push("image");
  if (downstreamIsStale) itemKeys.push("preview", "render");

  const items = itemKeys.map((key) => IMPACT_ITEMS[key]);
  const count = items.length;

  return {
    items,
    count,
    hasImpacts: count > 0,
    description:
      count === 0
        ? "현재 다시 확인할 제작 단계가 없습니다."
        : `${items.map((item) => item.label).join(", ")} 단계에 변경 영향이 있습니다.`,
  };
}
