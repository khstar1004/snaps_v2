"use client";

import Link from "next/link";
import { getRenderSafetyGuideItems } from "@/lib/studio/render-safety";

type StudioRenderSafetyGuideCardProps = {
  href: string;
};

export function StudioRenderSafetyGuideCard({ href }: StudioRenderSafetyGuideCardProps) {
  const items = getRenderSafetyGuideItems().slice(0, 3);

  return (
    <section className="studio-render-safety-card">
      <div className="studio-render-safety-card-head">
        <div>
          <div className="studio-render-safety-card-eyebrow">Render Safety</div>
          <div className="studio-render-safety-card-title">렌더 실패를 줄이는 자산 규칙</div>
        </div>
        <Link href={href} className="btn-secondary">
          전체 가이드
        </Link>
      </div>
      <div className="studio-render-safety-card-description">
        움짤, 웹 링크, 업로드 자산이 섞일 때는 파일 형식과 링크 종류가 중요합니다. 아래 기준을 지키면 서버 렌더 실패를 크게 줄일 수 있습니다.
      </div>
      <div className="studio-render-safety-card-list">
        {items.map((item) => (
          <article key={item.title} className="studio-render-safety-card-item">
            <strong>{item.title}</strong>
            <span>{item.description}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
