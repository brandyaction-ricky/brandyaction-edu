"use client";

import Link from "next/link";
import Image from "next/image";
import { BookOpen, ChevronDown, LayoutDashboard, Menu, ReceiptText, Settings, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { defaultSiteSettings, loadPublicHeaderSettings } from "@/lib/site-settings";
import { createClient } from "@/lib/supabase/client";

export function BrandHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [account, setAccount] = useState({ name: "", email: "", avatarUrl: "" });
  const [selectedHref, setSelectedHref] = useState("");
  const [header, setHeader] = useState({ basic: defaultSiteSettings.basic, navigation: defaultSiteSettings.navigation });
  useEffect(() => {
    let active = true;
    const refresh = () => loadPublicHeaderSettings().then((value) => { if (active) setHeader(value); }).catch(() => undefined);
    refresh();
    window.addEventListener("brandyaction:settings-updated", refresh);
    return () => { active = false; window.removeEventListener("brandyaction:settings-updated", refresh); };
  }, []);
  useEffect(() => {
    const sync = () => setSelectedHref(`${window.location.pathname}${window.location.hash}`);
    const timer = window.setTimeout(sync, 0);
    window.addEventListener("hashchange", sync);
    return () => { window.clearTimeout(timer); window.removeEventListener("hashchange", sync); };
  }, [pathname]);
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const syncUser = async (user: User | null) => {
      if (!active) return;
      if (!user) { setAuthenticated(false); setAccount({ name: "", email: "", avatarUrl: "" }); return; }
      const fallbackName = String(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "회원");
      setAuthenticated(true);
      setAccount({ name: fallbackName, email: user.email || "", avatarUrl: String(user.user_metadata?.avatar_url || user.user_metadata?.picture || "") });
      const { data: profile } = await supabase.from("profiles").select("full_name,avatar_url").eq("id", user.id).maybeSingle();
      if (active && profile) setAccount({ name: profile.full_name || fallbackName, email: user.email || "", avatarUrl: profile.avatar_url || String(user.user_metadata?.avatar_url || user.user_metadata?.picture || "") });
    };
    void supabase.auth.getUser().then(({ data }) => syncUser(data.user)).catch(() => { if (active) setAuthenticated(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { void syncUser(session?.user || null); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!(event.target as Element | null)?.closest("[data-account-menu]")) setAccountOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setAccountOpen(false); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", escape); };
  }, []);
  const closeMenus = () => { setOpen(false); setAccountOpen(false); };
  const applicationCta = authenticated === false
    ? <Link className="button button-primary button-sm" href={header.basic.ctaHref}>{header.basic.ctaLabel}</Link>
    : null;
  const accountLink = authenticated ? <div className="profile-menu" data-account-menu>
    <button type="button" className="profile-menu-trigger" onClick={() => setAccountOpen((value) => !value)} aria-expanded={accountOpen} aria-haspopup="menu">
      <span className="profile-avatar" style={account.avatarUrl ? { backgroundImage: `url(${account.avatarUrl})` } : undefined}>{account.avatarUrl ? "" : (account.name || account.email || "회").slice(0, 1).toUpperCase()}</span>
      <span className="profile-identity"><strong>{account.name || "회원"}</strong><small>{account.email}</small></span><ChevronDown/>
    </button>
    {accountOpen && <div className="profile-dropdown" role="menu">
      <Link href="/my" role="menuitem" onClick={closeMenus}><LayoutDashboard/><span><strong>마이페이지</strong><small>학습 현황 한눈에 보기</small></span></Link>
      <Link href="/my/cohort" role="menuitem" onClick={closeMenus}><BookOpen/><span><strong>내 클래스</strong><small>수강 중인 클래스와 일정</small></span></Link>
      <Link href="/my/orders" role="menuitem" onClick={closeMenus}><ReceiptText/><span><strong>구매내역</strong><small>결제·환불 상태 확인</small></span></Link>
      <Link href="/my/settings" role="menuitem" onClick={closeMenus}><Settings/><span><strong>계정설정</strong><small>내 정보와 계정 관리</small></span></Link>
    </div>}
  </div> : <Link href="/login" onClick={closeMenus}>로그인</Link>;
  return <header className="site-header">
    <div className="container header-inner">
      <Link href="/" className="brand-logo" aria-label="Brandy Action 홈"><Image src="/brandy-action-logo.png" alt="Brandy Action" width={311} height={79} priority/></Link>
      <nav id="main-navigation" className={open ? "main-nav open" : "main-nav"} aria-label="주요 메뉴">
        {header.navigation.map((item) => {
          const path = item.href.split("#")[0];
          const active = selectedHref === item.href || (!item.href.includes("#") && path.startsWith("/") && (pathname === path || (path !== "/" && pathname.startsWith(`${path}/`))));
          return <Link href={item.href} key={item.id} className={active ? "active" : undefined} aria-current={active ? "page" : undefined} onClick={() => { setSelectedHref(item.href); setOpen(false); }}>{item.label}</Link>;
        })}
        <div className={`mobile-actions ${authenticated === null ? "checking" : ""}`}>{accountLink}</div>
      </nav>
      <div className={`header-actions ${authenticated === null ? "checking" : ""}`}>{accountLink}{applicationCta}</div>
      <button type="button" className="menu-button" onClick={() => setOpen(!open)} aria-label={open ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={open} aria-controls="main-navigation">{open ? <X /> : <Menu />}</button>
    </div>
  </header>;
}
