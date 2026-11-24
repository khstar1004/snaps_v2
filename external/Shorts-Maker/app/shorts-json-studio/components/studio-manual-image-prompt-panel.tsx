"use client";

import { useMemo, useState } from "react";
import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type { PublishCategory } from "@/lib/publish/types";
import { withoutAutomaticImageProfileFields } from "@/lib/studio/image-mode-profile";
import { buildStudioManualImagePrompt } from "@/lib/studio/manual-image-prompt";
import type { CharacterProfile } from "@/types/character-profile";
import type { PreparedSlide } from "@/types/studio-json";

type StudioManualImagePromptPanelProps = {
  slide: PreparedSlide;
  slideIndex: number;
  totalSlides: number;
  publishCategory: PublishCategory;
  categoryMetadata?: PublishMetadata | null;
  fixedCharacterProfile?: CharacterProfile;
  imageStylePrompt?: string;
};

export function StudioManualImagePromptPanel({
  slide,
  slideIndex,
  totalSlides,
  publishCategory,
  categoryMetadata,
  fixedCharacterProfile,
  imageStylePrompt,
}: StudioManualImagePromptPanelProps) {
  const [status, setStatus] = useState("");
  const fallbackPrompt = useMemo(
    () =>
      buildStudioManualImagePrompt({
        slide: fixedCharacterProfile
          ? { ...slide, characterIds: [fixedCharacterProfile.characterId] }
          : slide,
        slideIndex,
        totalSlides,
        publishCategory,
        metadata: withoutAutomaticImageProfileFields(categoryMetadata),
        characterProfiles: fixedCharacterProfile ? [fixedCharacterProfile] : undefined,
        imageStylePrompt: fixedCharacterProfile ? undefined : imageStylePrompt,
        preferStyleOnlyBasePrompt: true,
      }),
    [
      categoryMetadata,
      fixedCharacterProfile,
      imageStylePrompt,
      publishCategory,
      slide,
      slideIndex,
      totalSlides,
    ]
  );
  const prompt = slide.manualImagePrompt || fallbackPrompt;
  const promptSourceLabel = prompt.source === "codex" ? "Codex local" : "Fallback";

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} 복사 완료`);
    } catch {
      setStatus(`${label} 복사에 실패했습니다. 직접 선택해서 복사해 주세요.`);
    }
  };

  return (
    <div className="studio-manual-image-prompt">
      <div className="studio-manual-image-prompt-head">
        <div className="studio-manual-image-prompt-copy">
          <div className="studio-manual-image-prompt-title">AI 이미지 프롬프트</div>
          <div className="studio-manual-image-prompt-description">
            장면별 프롬프트만 준비하는 모드입니다. 외부 이미지 생성 도구에 붙여 넣은 뒤 완성 이미지를 URL·파일·내 자산으로 적용하세요.
          </div>
        </div>
        <div className="studio-manual-image-prompt-chip-row">
          <span className="studio-preview-column-chip">{promptSourceLabel}</span>
          <span className="studio-preview-column-chip">정사각형 1:1</span>
          <span className="studio-preview-column-chip">텍스트 없는 이미지</span>
          <span className="studio-preview-column-chip">{prompt.characterSummary || prompt.mascotName}</span>
        </div>
      </div>

      {prompt.usesFallbackMascot ? (
        <p className="studio-manual-image-prompt-note">
          고정 캐릭터나 스타일을 선택하지 않아 대본 내용을 기준으로 프롬프트를 구성했습니다.
        </p>
      ) : null}

      {(prompt.anchorImageUrl || prompt.anchorAssetId) ? (
        <div className="studio-manual-image-prompt-anchor">
          <strong>기준 캐릭터 이미지</strong>
          <span>
            {prompt.anchorImageUrl ? "기준 이미지가 있으면 ChatGPT에 함께 올려 같은 캐릭터 정체성을 유지하세요." : "기준 자산 id가 저장되어 있습니다."}
          </span>
          {prompt.anchorImageUrl ? (
            <a href={prompt.anchorImageUrl} target="_blank" rel="noreferrer" className="btn-secondary">
              기준 이미지 열기
            </a>
          ) : null}
          {!prompt.anchorImageUrl && prompt.anchorAssetId ? (
            <span className="studio-manual-image-prompt-anchor-id">asset id: {prompt.anchorAssetId}</span>
          ) : null}
        </div>
      ) : null}

      {prompt.warning ? (
        <p className="studio-manual-image-prompt-note">
          {prompt.warning}
        </p>
      ) : null}

      <div className="studio-manual-image-prompt-section">
        <div className="studio-manual-image-prompt-section-head">
          <strong>Base character/style prompt</strong>
          <button type="button" className="btn-secondary" onClick={() => void handleCopy(prompt.basePrompt, "기본 프롬프트")}>
            복사
          </button>
        </div>
        <textarea className="input-field studio-manual-image-prompt-textarea" readOnly value={prompt.basePrompt} rows={5} />
      </div>

      <div className="studio-manual-image-prompt-section">
        <div className="studio-manual-image-prompt-section-head">
          <strong>Per-slide scene prompt</strong>
          <button type="button" className="btn-secondary" onClick={() => void handleCopy(prompt.scenePrompt, "장면 프롬프트")}>
            복사
          </button>
        </div>
        <textarea className="input-field studio-manual-image-prompt-textarea" readOnly value={prompt.scenePrompt} rows={5} />
      </div>

      <div className="studio-manual-image-prompt-section">
        <div className="studio-manual-image-prompt-section-head">
          <strong>최종 붙여넣기용 프롬프트</strong>
          <button type="button" className="btn-primary" onClick={() => void handleCopy(prompt.finalPrompt, "최종 프롬프트")}>
            최종 프롬프트 복사
          </button>
        </div>
        <textarea className="input-field studio-manual-image-prompt-textarea" readOnly value={prompt.finalPrompt} rows={8} />
      </div>

      <p className="studio-manual-image-prompt-note">
        고정 캐릭터의 기준 이미지가 있으면 외부 생성 도구에 함께 올리고, 완성 결과는 아래 직접 교체 영역에서 적용하세요.
      </p>
      {status ? <div className="studio-manual-image-prompt-status">{status}</div> : null}
    </div>
  );
}
