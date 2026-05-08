import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';

export const metadata = {
  title: 'snaps 이용약관',
};

const sections = [
  {
    title: '서비스',
    body: 'snaps는 연결 채널과 로컬 AI 워크플로를 통해 소셜 콘텐츠를 변환, 초안 작성, 예약, 분석할 수 있도록 돕습니다.',
  },
  {
    title: '계정과 권한',
    body: '워크스페이스에 연결한 채널, 인증 정보, 콘텐츠에 대한 책임은 사용자에게 있습니다. API 키와 계정 접근 권한은 안전하게 관리해야 합니다.',
  },
  {
    title: '콘텐츠',
    body: '사용자가 제공한 원문 자료의 권리는 사용자에게 있습니다. AI가 만든 초안은 게시 또는 예약 전에 반드시 검토해야 합니다.',
  },
  {
    title: '외부 플랫폼',
    body: '게시 기능은 연결된 각 플랫폼의 API와 정책에 따라 동작합니다. 일부 채널은 자동 게시 대신 복사/내보내기 보조 방식만 지원할 수 있습니다.',
  },
  {
    title: '결제',
    body: '유료 기능, 체험 기간, 해지 규칙은 결제 화면 또는 워크스페이스 결제 설정에서 확인할 수 있습니다.',
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#081113] text-white">
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-[32px] px-[24px] py-[56px]">
        <LogoTextComponent />
        <div>
          <h1 className="text-[34px] font-semibold">이용약관</h1>
          <p className="mt-[10px] max-w-[680px] text-[15px] leading-6 text-[#9fb0b4]">
            이 약관은 snaps 워크스페이스, 연결 채널, AI 생성 초안,
            분석 보고서, 게시 워크플로의 운영 기준을 설명합니다.
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
