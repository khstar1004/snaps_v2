import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "숏메이커",
  description: "스크립트 기반 숏폼 제작 및 발행 스튜디오",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
