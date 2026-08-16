"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { defaultSiteSettings, loadPublicHeaderSettings } from "@/lib/site-settings";
import { createClient } from "@/lib/supabase/client";

export function BrandHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [header, setHeader] = useState({ basic: defaultSiteSettings.basic, navigation: defaultSiteSettings.navigation });
  useEffect(() => {
    let active = true;
    const refresh = () => loadPublicHeaderSettings().then((value) => { if (active) setHeader(value); }).catch(() => undefined);
    refresh();
    window.addEventListener("brandyaction:settings-updated", refresh);
    return () => { active = false; window.removeEventListener("brandyaction:settings-updated", refresh); };
  }, []);
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    void supabase.auth.getUser().then(({ data }) => { if (active) setAuthenticated(Boolean(data.user)); }).catch(() => { if (active) setAuthenticated(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setAuthenticated(Boolean(session?.user)));
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  const accountLink = authenticated ? <Link href="/my" onClick={() => setOpen(false)}>마이페이지</Link> : <Link href="/login" onClick={() => setOpen(false)}>로그인</Link>;
  return <header className="site-header">
    <div className="container header-inner">
      <Link href="/" className="brand-logo" aria-label="Brandy Action 홈"><Image src="/brandy-action-logo.png" alt="Brandy Action" width={311} height={79} priority/></Link>
      <nav id="main-navigation" className={open ? "main-nav open" : "main-nav"} aria-label="주요 메뉴">
        {header.navigation.map((item) => {
          const path = item.href.split("#")[0];
          const active = !item.href.includes("#") && path.startsWith("/") && (pathname === path || (path !== "/" && pathname.startsWith(`${path}/`)));
          return <Link href={item.href} key={item.id} className={active ? "active" : undefined} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)}>{item.label}</Link>;
        })}
        <div className={`mobile-actions ${authenticated === null ? "checking" : ""}`}>{accountLink}</div>
      </nav>
      <div className={`header-actions ${authenticated === null ? "checking" : ""}`}>{accountLink}<Link className="button button-primary button-sm" href={header.basic.ctaHref}>{header.basic.ctaLabel}</Link></div>
      <button type="button" className="menu-button" onClick={() => setOpen(!open)} aria-label={open ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={open} aria-controls="main-navigation">{open ? <X /> : <Menu />}</button>
    </div>
  </header>;
}
