'use client';

import {
  ArrowRight,
  LogOut,
  Menu,
  MessageCircle,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  adminContentWidth,
  adminNavigationIcon,
  adminNavigationGroups,
  adminNavigationTitles,
  adminSectionTitle,
  normalizeAdminSectionKey,
  type AdminNavigationItem,
} from '../navigation/admin-navigation';
import { createAdminMenuVisibility } from '../permissions/menu-visibility';

export type AdminShellUser = {
  full_name?: string | null;
  role: string;
};

export function AdminShell({
  current,
  available,
  user,
  pendingReviews = 0,
  mobile,
  setMobile,
  logout,
  prefetchSection,
  children,
}: {
  current: string;
  available: AdminNavigationItem[];
  user: AdminShellUser;
  pendingReviews?: number;
  mobile: boolean;
  setMobile: (value: boolean) => void;
  logout: () => Promise<void>;
  prefetchSection?: (section: string) => void;
  children: ReactNode;
}) {
  const selected = normalizeAdminSectionKey(current);
  const byKey = new Map(available.map(item => [item.key, item]));
  const visibility = createAdminMenuVisibility(available);
  const contentWidth = adminContentWidth(selected);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const tablet = window.matchMedia('(max-width: 1024px)');
    const closePersistentSidebar = (event: MediaQueryListEvent) => {
      if (!event.matches) setMobile(false);
    };
    tablet.addEventListener('change', closePersistentSidebar);
    return () => tablet.removeEventListener('change', closePersistentSidebar);
  }, [setMobile]);
  useEffect(() => {
    if (!mobile) return;
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const restoreFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const focusable = () => Array.from(sidebar.querySelectorAll<HTMLElement>('a[href],button,summary,[tabindex]:not([tabindex="-1"])')).filter(element => !element.hasAttribute('disabled') && element.getClientRects().length > 0);
    document.body.style.overflow = 'hidden';
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobile(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const stops = focusable(), first = stops[0], last = stops.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (restoreFocus?.isConnected) restoreFocus.focus();
    };
  }, [mobile, setMobile]);
  const navLink = (key: string) => {
    const item = byKey.get(key);
    if (!visibility.has(key)) return null;
    const Icon = adminNavigationIcon(key);
    return (
      <Link
        key={key}
        href={key === 'overview' ? '/admin' : `/admin/${key}`}
        className={`nav-link ${selected === key ? 'active' : ''}`}
        aria-current={selected === key ? 'page' : undefined}
        onPointerEnter={() => prefetchSection?.(key === 'overview' ? 'home' : key)}
        onFocus={() => prefetchSection?.(key === 'overview' ? 'home' : key)}
        onClick={() => setMobile(false)}
      >
        <Icon aria-hidden="true" />
        {item ? adminNavigationTitles[key] || item.title : '운영 홈'}
        {key === 'reviews' && pendingReviews > 0 && <span className="nav-count">{pendingReviews}</span>}
      </Link>
    );
  };
  const extra = ['staff'].filter(key => byKey.has(key));
  return (
    <>
      <a className="skip" href="#admin-content">본문으로 이동</a>
      {mobile && <button type="button" className="admin-sidebar-backdrop" aria-label="관리자 메뉴 닫기" onClick={() => setMobile(false)}/>}
      <aside ref={sidebarRef} className={`sidebar ${mobile ? 'open' : ''}`} id="admin-sidebar" role={mobile ? 'dialog' : undefined} aria-modal={mobile ? 'true' : undefined} aria-label={mobile ? '관리자 메뉴' : undefined}>
        <button
          type="button"
          className="btn ghost sidebar-close"
          onClick={() => setMobile(false)}
          aria-label="관리자 메뉴 닫기"
        >
          메뉴 닫기
          <X aria-hidden="true" />
        </button>
        <Link className="brand" href="/admin">
          <Image className="brand-logo" src="/brandy-action-logo.png" alt="BrandyAction" width={164} height={32} priority />
          <span><small>EDU / ADMIN</small></span>
        </Link>
        <div className="workspace-label">
          <span className="square">B</span>클래스 운영 워크스페이스
        </div>
        <nav aria-label="관리자 카테고리">
          {navLink('overview')}
          {visibility.groups(adminNavigationGroups).map(([title, keys]) => (
            <details
              className="nav-group"
              key={title + selected}
              open={selected === 'overview' || keys.some(key => key === selected)}
            >
              <summary>{title}<span className="nav-category-count">{keys.filter(key => byKey.has(key)).length}</span></summary>
              {keys.map(navLink)}
            </details>
          ))}
          {extra.length > 0 && (
            <details className="nav-group" open={extra.includes(selected)}>
              <summary>추가 운영 도구</summary>
              {extra.map(navLink)}
            </details>
          )}
        </nav>
        <div className="side-footer">
          <Link className="btn ghost full" href="/">
            고객 화면 보기
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <div className="profile">
          <span className="avatar">{(user.full_name || '운영').slice(0, 1)}</span>
          <div>
            <b>{user.full_name || '운영자'}</b>
            <div className="meta">{user.role === 'admin' ? '관리자' : '스태프'}</div>
          </div>
        </div>
      </aside>
      <div className="app" inert={mobile ? true : undefined}>
        <header className="topbar">
          <div className="crumb">
            <button
              ref={menuButtonRef}
              className="btn iconbtn ghost mobile-menu"
              aria-controls="admin-sidebar"
              aria-expanded={mobile}
              aria-label="관리자 메뉴 열기"
              onClick={() => setMobile(!mobile)}
            >
              <Menu aria-hidden="true" />
            </button>
            <span className="crumb-root">관리자</span>
            <span className="crumb-root">/</span>
            <span>{adminSectionTitle(current, available)}</span>
          </div>
          <div className="topright">
            {byKey.has('questions') && (
              <Link className="btn iconbtn ghost" href="/admin/questions" aria-label="질문함">
                <MessageCircle aria-hidden="true" />
              </Link>
            )}
            <button className="btn iconbtn ghost" onClick={() => void logout()} aria-label="로그아웃">
              <LogOut aria-hidden="true" />
            </button>
            <span className="avatar">{(user.full_name || '운영').slice(0, 1)}</span>
          </div>
        </header>
        <div className={`content admin-content-${contentWidth}`} id="admin-content" tabIndex={-1}>
          {children}
        </div>
      </div>
    </>
  );
}
