import type { Metadata } from "next";
import "./globals.css";
import { SiteFooter } from "./components/site-footer";

export const metadata: Metadata = {
  title: "브랜디액션 에듀 | 실행으로 결과를 만드는 교육",
  description: "자영업자와 사업가를 위한 기수제 라이브 실전 교육 플랫폼",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}<SiteFooter /></body></html>;
}
