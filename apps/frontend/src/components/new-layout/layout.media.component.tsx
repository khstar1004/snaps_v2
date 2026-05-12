'use client';

import { MediaBox } from '@gitroom/frontend/components/media/media.component';
import { SnapsShortsWorkspace } from '@gitroom/frontend/components/snaps/snaps-shorts-workspace';

export const MediaLayoutComponent = () => {
  return (
    <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[16px] transition-all overflow-auto">
      <div className="flex items-end justify-between gap-[14px] maxMedia:flex-col maxMedia:items-start">
        <div>
          <h1 className="text-[24px] font-[800] leading-tight text-newTextColor">
            콘텐츠 미디어
          </h1>
          <div className="mt-[6px] text-[13px] text-textItemBlur">
            쇼츠 생성과 업로드 소재 관리를 한 곳에서 처리합니다.
          </div>
        </div>
        <div className="flex gap-[8px] text-[11px] text-textItemBlur">
          <span className="rounded-[999px] bg-newBgLineColor px-[10px] py-[5px]">
            Shorts
          </span>
          <span className="rounded-[999px] bg-newBgLineColor px-[10px] py-[5px]">
            Media
          </span>
        </div>
      </div>
      <SnapsShortsWorkspace />
      <section className="bg-newBgColorInner border border-newBorder rounded-[8px] overflow-hidden flex flex-1 min-h-[520px] flex-col text-newTextColor">
        <div className="border-b border-newBorder bg-newBgLineColor/45 px-[18px] py-[14px]">
          <div className="text-[20px] font-[700]">미디어 라이브러리</div>
          <div className="mt-[4px] text-[13px] text-textItemBlur">
            게시물에 사용할 이미지와 영상을 관리합니다.
          </div>
        </div>
        <div className="p-[18px] flex-1 min-h-0">
          <MediaBox setMedia={() => {}} closeModal={() => {}} standalone={true} />
        </div>
      </section>
    </div>
  );
};
