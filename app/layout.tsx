import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "강사 일정 보드",
  description: "강의, 보조강의, 출근과 휴무를 한 화면에서 관리하는 사내 일정 보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <style id="mobile-filter-boot-style">{`
          @media (max-width: 820px) {
            .sidebar {
              position: fixed;
              left: 0;
              visibility: hidden;
              transform: translateX(-105%);
            }

            .app-shell.mobile-layout-ready .sidebar {
              visibility: visible;
            }
          }
        `}</style>
        {children}
      </body>
    </html>
  );
}
