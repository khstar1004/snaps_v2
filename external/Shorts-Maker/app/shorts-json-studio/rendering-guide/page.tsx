import Link from "next/link";
import { getRenderSafetyGuideItems, getRenderSafetyGuideNotes } from "@/lib/studio/render-safety";

export default function StudioRenderingGuidePage() {
  const items = getRenderSafetyGuideItems();
  const notes = getRenderSafetyGuideNotes();

  return (
    <main className="studio-rendering-guide-page">
      <section className="card studio-rendering-guide-hero">
        <div className="studio-rendering-guide-hero-top">
          <div>
            <div className="studio-rendering-guide-eyebrow">Shorts Studio</div>
            <h1 className="studio-rendering-guide-title">렌더 안전 가이드</h1>
          </div>
          <Link href="/shorts-json-studio" className="btn-secondary">
            스튜디오로 돌아가기
          </Link>
        </div>
        <p className="studio-rendering-guide-description">
          로컬 업로드, 라이브러리 에셋, 임의 웹 링크가 섞일 때 렌더 실패를 줄이기 위한 기준입니다. 핵심은 페이지 링크 대신 실제 파일 링크를 쓰고, 움짤은 `gif` 또는 `mp4/webm` 직접 링크를 유지하는 것입니다.
        </p>
      </section>

      <section className="studio-rendering-guide-grid">
        {items.map((item, index) => (
          <article key={item.title} className="card studio-rendering-guide-card">
            <div className="studio-rendering-guide-index">0{index + 1}</div>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
          </article>
        ))}
      </section>

      <section className="card studio-rendering-guide-note-card">
        <h2>실무 체크</h2>
        <div className="studio-rendering-guide-note-list">
          {notes.map((note) => (
            <div key={note} className="studio-rendering-guide-note-item">
              {note}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
