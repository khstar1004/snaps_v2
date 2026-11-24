"use client";

export function DefaultTemplatePreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`studio-template-preview-default${compact ? " is-compact" : ""}`}>
      <div className="studio-template-preview-default-brand">
        법률사무소 디딤 홍연주
      </div>

      <div className="studio-template-preview-default-title">
        전여친 찾아갔다가 전과자?
      </div>

      <div className="studio-template-preview-default-meta">
        00 | 17:30 | 조회수 112112
      </div>

      <div className="studio-template-preview-default-copy">
        그 마음 이해해.
        {"\n"}
        위험하거나
      </div>

      <div className="studio-template-preview-default-media-wrap">
        <div aria-hidden="true" className="studio-template-preview-default-media" />
      </div>

      <div className="studio-template-preview-default-spacer" />

      <div className="studio-template-preview-default-footer" />
    </div>
  );
}
