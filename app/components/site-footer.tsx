"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { defaultSiteSettings, loadSiteSettings } from "@/lib/site-settings";

const hiddenPrefixes = ["/admin", "/my", "/login", "/auth"];

export function SiteFooter() {
  const pathname = usePathname();
  const [settings, setSettings] = useState(defaultSiteSettings);

  useEffect(() => {
    if (hiddenPrefixes.some((prefix) => pathname.startsWith(prefix))) return;
    let active = true;
    const refresh = () => loadSiteSettings().then((value) => { if (active) setSettings(value); }).catch(() => undefined);
    refresh();
    window.addEventListener("brandyaction:settings-updated", refresh);
    return () => {
      active = false;
      window.removeEventListener("brandyaction:settings-updated", refresh);
    };
  }, [pathname]);

  if (hiddenPrefixes.some((prefix) => pathname.startsWith(prefix))) return null;

  const { basic } = settings;
  return <footer className="footer">
    <div className="container footer-grid">
      <div className="footer-brand">
        <strong>{basic.siteName}</strong>
        <p>{basic.description}</p>
      </div>
      <nav className="footer-links" aria-label="정책 및 고객지원">
        <Link href="/policies/terms">이용약관</Link>
        <Link href="/policies/privacy">개인정보처리방침</Link>
        <Link href="/policies/refund">환불규정</Link>
        <a href={`mailto:${basic.supportEmail}`}>문의하기</a>
      </nav>
      <div className="footer-business" aria-label="사업자 정보">
        <span><b>상호</b>{basic.companyName}</span>
        <span><b>대표자</b>{basic.representatives}</span>
        <span><b>사업자등록번호</b>{basic.businessNumber}</span>
        {basic.mailOrderNumber && <span><b>통신판매업 신고번호</b>{basic.mailOrderNumber}</span>}
        <span><b>대표전화</b><a href={`tel:${basic.supportPhone.replace(/[^0-9+]/g, "")}`}>{basic.supportPhone}</a></span>
        <span className="footer-address"><b>주소</b>{basic.businessAddress}</span>
        <span><b>고객지원</b><a href={`mailto:${basic.supportEmail}`}>{basic.supportEmail}</a></span>
      </div>
      <p className="footer-copyright">© 2026 BrandyAction Co., Ltd. All rights reserved.</p>
    </div>
  </footer>;
}
