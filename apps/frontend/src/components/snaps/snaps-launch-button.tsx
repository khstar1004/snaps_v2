'use client';

import Link from 'next/link';

export function SnapsLaunchButton() {
  return (
    <Link
      href="/snaps"
      className="text-white flex-1 pt-[12px] pb-[14px] ps-[16px] pe-[20px] group-[.sidebar]:p-0 min-h-[44px] max-h-[44px] rounded-md bg-ai flex justify-center items-center gap-[5px] outline-none"
    >
      <div className="w-[21px] h-[20px] min-w-[21px] min-h-[20px] rounded-[6px] border border-white/70 flex items-center justify-center text-[11px] font-[800]">
        S
      </div>
      <div className="flex-1 text-start text-[14px] group-[.sidebar]:hidden">
        snaps 변환
      </div>
    </Link>
  );
}
