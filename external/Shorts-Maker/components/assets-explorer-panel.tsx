"use client";

type AssetsCategoryOption = {
  key: string;
  label: string;
};

type AssetsExplorerPanelProps = {
  selectedCategory: string;
  categoryOptions: AssetsCategoryOption[];
  search: string;
  hasResults: boolean;
  onCategoryChangeAction: (value: string) => void;
  onSearchChangeAction: (value: string) => void;
  children?: React.ReactNode;
};

export function AssetsExplorerPanel({
  selectedCategory,
  categoryOptions,
  search,
  hasResults,
  onCategoryChangeAction,
  onSearchChangeAction,
  children,
}: AssetsExplorerPanelProps) {
  const categoryId = "assets-category-filter";
  const searchId = "assets-search-filter";

  return (
    <section className="card page-section-card">
      <div className="page-section-head">
        <h2 className="page-section-title">완성 영상 목록</h2>
        <div className="page-control-row">
          <div className="page-field-stack">
            <label htmlFor={categoryId} className="page-field-label">콘텐츠 프로필</label>
            <select id={categoryId} className="input-field" value={selectedCategory} onChange={(event) => onCategoryChangeAction(event.target.value)}>
              <option value="all">전체 프로필</option>
              {categoryOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
              <option value="uncategorized">미분류</option>
            </select>
          </div>
          <div className="page-field-stack">
            <label htmlFor={searchId} className="page-field-label">검색</label>
            <input
              id={searchId}
              className="input-field"
              value={search}
              onChange={(event) => onSearchChangeAction(event.target.value)}
              placeholder="영상 제목 또는 URL 검색"
            />
          </div>
        </div>
      </div>

      {!hasResults ? (
        <div className="page-muted-box">현재 필터 조건에 맞는 완성 영상이 없습니다.</div>
      ) : (
        children
      )}
    </section>
  );
}
