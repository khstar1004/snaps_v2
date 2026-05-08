import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';

export const metadata = {
  title: 'snaps 개인정보 처리방침',
};

const sections = [
  {
    title: '처리하는 데이터',
    body: 'snaps는 워크스페이스 프로필, 연결 채널 정보, 초안, 예약 정보, 업로드한 미디어 참조, 분석 스냅샷, 사용자가 등록한 스타일 예시를 저장합니다.',
  },
  {
    title: 'AI 처리 방식',
    body: '로컬 Ollama를 설정하면 snaps는 호스팅 LLM 제공자 대신 사용자가 지정한 로컬 모델 엔드포인트로 프롬프트와 스타일 맥락을 전송합니다.',
  },
  {
    title: '게시 플랫폼 연동',
    body: '연결된 소셜 플랫폼에는 각 API 요구사항에 따라 콘텐츠, 미디어, 메타데이터, 예약 요청이 전달될 수 있습니다.',
  },
  {
    title: '보관과 삭제',
    body: '워크스페이스 관리자는 초안, 생성 결과, 스타일 예시, 분석 스냅샷, 보고서, 워크스페이스 내보내기 파일의 보관 정책을 관리합니다.',
  },
  {
    title: '보안',
    body: '배포 시크릿, OAuth 인증 정보, 데이터베이스 백업, 로컬 모델 엔드포인트를 보호해야 합니다. 더 이상 사용하지 않는 연동은 즉시 해제하세요.',
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#081113] text-white">
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-[32px] px-[24px] py-[56px]">
        <LogoTextComponent />
        <div>
          <h1 className="text-[34px] font-semibold">개인정보 처리방침</h1>
          <p className="mt-[10px] max-w-[680px] text-[15px] leading-6 text-[#9fb0b4]">
            이 문서는 snaps가 워크스페이스 데이터, 연결 채널, 로컬 AI 처리,
            분석 기록을 현재 제품에서 어떻게 다루는지 요약합니다.
          </p>
        </div>
        <div className="grid gap-[16px]">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-[8px] border border-[#273235] bg-[#12191b] p-[20px]"
            >
              <h2 className="text-[18px] font-semibold">{section.title}</h2>
              <p className="mt-[8px] text-[14px] leading-6 text-[#b9c6ca]">
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
