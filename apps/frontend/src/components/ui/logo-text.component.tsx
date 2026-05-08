import React from 'react';

export const LogoTextComponent = () => {
  return (
    <div className="flex items-center gap-[12px] text-white">
      <svg
        width="36"
        height="36"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="3" y="5" width="23" height="23" rx="6" fill="#0EA5A8" />
        <rect
          x="10"
          y="8"
          width="23"
          height="23"
          rx="6"
          fill="#F6A623"
          stroke="#081113"
          strokeWidth="1.6"
        />
        <path
          d="M16 22.5C16.9 23.35 18.25 23.85 19.8 23.85C22.05 23.85 23.55 22.83 23.55 21.22C23.55 19.65 22.38 19.03 19.86 18.47C17.62 17.98 16.54 17.15 16.54 15.58C16.54 14.02 18 12.95 20 12.95C21.35 12.95 22.55 13.35 23.38 14.05"
          stroke="#081113"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[26px] font-[800] tracking-[0]">snaps</span>
    </div>
  );
};
