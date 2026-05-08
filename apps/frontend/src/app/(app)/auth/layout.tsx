export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { TestimonialComponent } from '@gitroom/frontend/components/auth/testimonial.component';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="bg-[#081113] flex flex-1 p-[12px] gap-[12px] min-h-screen w-screen text-white">
      {/*<style>{`html, body {overflow-x: hidden;}`}</style>*/}
      <ReturnUrlComponent />
      <div className="flex flex-col py-[40px] px-[20px] flex-1 lg:w-[600px] lg:flex-none rounded-[12px] text-white p-[12px] bg-[#12191B]">
        <div className="w-full max-w-[440px] mx-auto justify-center gap-[20px] h-full flex flex-col text-white">
          <LogoTextComponent />
          <div className="flex">{children}</div>
        </div>
      </div>
      <div
        className="relative flex-1 overflow-hidden rounded-[12px] hidden lg:flex flex-col justify-end p-[48px] bg-cover bg-center"
        style={{ backgroundImage: "url('/brand/snaps-operations-bg.png')" }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[#081113] via-[#081113]/50 to-transparent" />
        <div className="relative max-w-[520px] text-[34px] leading-[1.25] font-[700] text-balance">
          한국 팀을 위한 AI 콘텐츠 운영 워크스페이스
          <div className="mt-[14px] text-[15px] leading-[1.7] font-[400] text-[#d7e6e8]">
            원문 정리, 채널별 변환, 예약 게시, 성과 분석까지 한 화면에서 이어집니다.
          </div>
        </div>
        <TestimonialComponent />
      </div>
    </div>
  );
}
