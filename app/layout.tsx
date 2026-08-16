import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { SiteFooter } from "./components/site-footer";
import { AnalyticsTracker } from "./components/analytics-tracker";
import { loadCodeSettings } from "@/lib/code-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "브랜디액션 에듀 | 실행으로 결과를 만드는 교육",
  description: "자영업자와 사업가를 위한 기수제 라이브 실전 교육 플랫폼",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const appEnvironment = process.env.NEXT_PUBLIC_APP_ENV ?? "production";
  const isNonProduction = appEnvironment !== "production";
  const codes = await loadCodeSettings();

  return (
    <html lang="ko">
      <head dangerouslySetInnerHTML={{ __html: `${codes.metaCode}\n${codes.headerCode}` }}/>
      <body data-app-environment={appEnvironment}>
        {codes.bodyCode ? <div className="body-code-injection" dangerouslySetInnerHTML={{ __html: codes.bodyCode }}/> : null}
        {isNonProduction ? (
          <div className="environment-banner" role="status">
            DEV 테스트 서버 · 이곳의 회원·상품·결제 데이터는 운영 서버와 분리됩니다.
          </div>
        ) : null}
        {children}
        <Suspense fallback={null}><AnalyticsTracker /></Suspense>
        <SiteFooter />
      </body>
    </html>
  );
}
