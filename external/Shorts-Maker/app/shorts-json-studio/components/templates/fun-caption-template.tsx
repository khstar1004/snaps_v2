"use client";

type FunCaptionTemplatePreviewProps = {
  compact?: boolean;
};

export function FunCaptionTemplatePreview({ compact = false }: FunCaptionTemplatePreviewProps) {
  return (
    <div className={`studio-template-preview-fun${compact ? " is-compact" : ""}`}>
      <div className="studio-template-preview-fun-overlay" />
      <div className="studio-template-preview-fun-stage" />
      <div className="studio-template-preview-fun-top-caption">
        스피드가 방송 중 실망한 순간들이라는데
      </div>
      <div className="studio-template-preview-fun-main-caption">
        순간들이라는데
      </div>
    </div>
  );
}
