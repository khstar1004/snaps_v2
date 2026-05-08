'use client';

export const Logo = () => {
  return (
    <div className="mt-[8px] min-w-[60px] min-h-[60px] w-[60px] h-[60px] flex items-center justify-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="52"
        height="52"
        viewBox="0 0 52 52"
        fill="none"
      >
        <rect x="5" y="7" width="33" height="33" rx="9" fill="#0EA5A8" />
        <rect
          x="14"
          y="12"
          width="33"
          height="33"
          rx="9"
          fill="#F6A623"
          stroke="#081113"
          strokeWidth="2"
        />
        <path
          d="M23 31.1C24.28 32.34 26.27 33.08 28.52 33.08C31.81 33.08 34.02 31.58 34.02 29.22C34.02 26.94 32.3 26.02 28.61 25.2C25.31 24.47 23.72 23.26 23.72 20.95C23.72 18.66 25.86 17.08 28.8 17.08C30.78 17.08 32.52 17.66 33.76 18.7"
          stroke="#081113"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
