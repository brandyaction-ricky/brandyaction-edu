import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { SiteFooter } from "./components/site-footer";
import { AnalyticsTracker } from "./components/analytics-tracker";
import { loadCodeSettings } from "@/lib/code-settings";
import { loadSeoSettings } from "@/lib/seo-settings";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const seo = await loadSeoSettings();
  return {
    title: seo.title, description: seo.description,
    openGraph: { title: seo.title, description: seo.description, ...(seo.image ? { images: [seo.image] } : {}) },
    robots: (process.env.NEXT_PUBLIC_APP_ENV ?? "production") !== "production" ? { index: false, follow: false } : undefined,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  };
}

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
