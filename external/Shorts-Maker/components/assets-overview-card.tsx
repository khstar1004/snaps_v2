"use client";

type AssetsOverviewCardProps = {
  loading: boolean;
  totalAssets: number;
  filteredAssets: number;
  onRefreshAction: () => void;
};

export function AssetsOverviewCard({
  loading,
  totalAssets,
  filteredAssets,
  onRefreshAction,
}: AssetsOverviewCardProps) {
  return (
    <section className="card page-hero-card assets-overview-card">
      <div className="page-hero-head">
        <div className="page-hero-copy">
          <div className="page-hero-eyebrow">Library · Video</div>
          <h1 className="page-hero-title">완성 영상</h1>
          <p className="page-hero-description">
            렌더 후 저장된 결과물을 콘텐츠 프로필별로 확인하고, 재생하거나 다시 편집합니다.
          </p>
        </div>
        <div className="page-hero-actions">
          <button type="button" className="btn-secondary" disabled={loading} onClick={onRefreshAction}>
            완성 영상 새로고침
          </button>
        </div>
      </div>
      <div className="page-hero-stats">
        <span className="page-chip">전체 영상 <strong>{totalAssets}</strong></span>
        <span className="page-chip">필터 결과 <strong>{filteredAssets}</strong></span>
      </div>
    </section>
  );
}
