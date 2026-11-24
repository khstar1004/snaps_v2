"use client";

export function BlackTemplatePreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`studio-template-preview-black${compact ? " is-compact" : ""}`}>
      <div className="studio-template-preview-black-headline">
        <span className="studio-template-preview-black-title-line">혼자 보기에도</span>
        <span className="studio-template-preview-black-title-line is-accent">민망한 애니</span>
      </div>

      <div className="studio-template-preview-black-scene">
        <div aria-hidden="true" className="studio-template-preview-black-shape stage" />
        <div aria-hidden="true" className="studio-template-preview-black-shape panel" />
        <div aria-hidden="true" className="studio-template-preview-black-shape glow" />
        <div aria-hidden="true" className="studio-template-preview-black-shape leg" />
        <div aria-hidden="true" className="studio-template-preview-black-shape shoe" />
      </div>

      <div className="studio-template-preview-black-copy">
        알면 의외로
        {"\n"}
        혼자 보기 민망한
        {"\n"}
        장면만 정리
      </div>
    </div>
  );
}
