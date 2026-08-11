"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { defaultSiteSettings, loadPublicHeaderSettings } from "@/lib/site-settings";

export function BrandHeader() {
  const [open, setOpen] = useState(false);
  const [header, setHeader] = useState({ basic: defaultSiteSettings.basic, navigation: defaultSiteSettings.navigation });
  useEffect(() => {
    let active = true;
    const refresh = () => loadPublicHeaderSettings().then((value) => { if (active) setHeader(value); }).catch(() => undefined);
    refresh();
    window.addEventListener("brandyaction:settings-updated", refresh);
    return () => { active = false; window.removeEventListener("brandyaction:settings-updated", refresh); };
  }, []);
  const logo = useMemo(() => {
    const parts = header.basic.siteName.trim().split(/\s+/);
    const accent = parts.pop() || "EDU";
    return { prefix: parts.length ? `${parts.join(" ")} ` : "", accent };
  }, [header.basic.siteName]);
  return <header className="site-header">
    <div className="container header-inner">
      <Link href="/" className="brand-logo">{logo.prefix}<span>{logo.accent}</span></Link>
      <nav id="main-navigation" className={open ? "main-nav open" : "main-nav"} aria-label="주요 메뉴">
        {header.navigation.map((item) => <Link href={item.href} key={item.id} onClick={() => setOpen(false)}>{item.label}</Link>)}
        <div className="mobile-actions"><Link href="/login">로그인</Link><Link href="/my">내 클래스</Link></div>
      </nav>
      <div className="header-actions"><Link href="/login">로그인</Link><Link href="/my">내 클래스</Link><Link className="button button-primary button-sm" href={header.basic.ctaHref}>{header.basic.ctaLabel}</Link></div>
      <button type="button" className="menu-button" onClick={() => setOpen(!open)} aria-label={open ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={open} aria-controls="main-navigation">{open ? <X /> : <Menu />}</button>
    </div>
  </header>;
}
