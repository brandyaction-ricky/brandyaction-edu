'use client';

import { LearningNoticeBar } from '@/app/ui/final/learning-notice';
import {
  ArrowRight,
  Compass,
  LogOut,
  Menu,
  MessageCircle,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  id?: string;
  full_name?: string | null;
  role: string;
};

export function AdminShell({
  current,
  available,
  user,
  pendingReviews = 0,
  openQuestions = 0,
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
  openQuestions?: number;
  mobile: boolean;
  setMobile: (value: boolean) => void;
  logout: () => Promise<void>;
  prefetchSection?: (section: string) => void;
  children: ReactNode;
}) {
  const selected = normalizeAdminSectionKey(current);
  const byKey = new Map(available.map(item => [item.key, item]));
  const visibility = createAdminMenuVisibility(available);
  const groups = visibility.groups(adminNavigationGroups);
  const contentWidth = adminContentWidth(selected);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [openGroups, setOpenGroups] = useState(() => new Set(
    groups.filter(([, keys]) => selected === 'overview' || keys.some(key => key === selected)).map(([title]) => title),
  ));
  useEffect(() => {
    const tablet = window.matchMedia('(max-width: 1024px)');
    const closePersistentSidebar = (event: MediaQueryListEvent) => {
      if (!event.matches) setMobile(false);
    };
    tablet.addEventListener('change', closePersistentSidebar);
    return () => tablet.removeEventListener('change', closePersistentSidebar);
  }, [setMobile]);
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const active = sidebar.querySelector<HTMLElement>('.nav-link[aria-current="page"]');
    if (!active) return;
    const group = active.closest('details');
    const groupTitle = group?.querySelector('summary')?.textContent?.replace(/\d+$/, '').trim();
    if (groupTitle) setOpenGroups(current => current.has(groupTitle) ? current : new Set([...current, groupTitle]));
    const frame = requestAnimationFrame(() => {
      const top = active.offsetTop;
      const bottom = top + active.offsetHeight;
      if (top < sidebar.scrollTop) sidebar.scrollTop = Math.max(0, top - 12);
      else if (bottom > sidebar.scrollTop + sidebar.clientHeight) sidebar.scrollTop = bottom - sidebar.clientHeight + 12;
    });
    return () => cancelAnimationFrame(frame);
  }, [selected]);
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
        {key === 'questions' && openQuestions > 0 && <span className="nav-count" aria-label={`미답변 ${openQuestions}건`}>{openQuestions}</span>}
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
          {user.role === 'admin' && <Link href="/admin/diagnosis" className="nav-link" onClick={() => setMobile(false)}><Compass aria-hidden="true"/>N6 진단 검수</Link>}
          {groups.map(([title, keys]) => (
            <details
              className="nav-group"
              key={title}
              open={openGroups.has(title)}
              onToggle={event => {
                const isOpen = event.currentTarget.open;
                setOpenGroups(current => {
                  if (current.has(title) === isOpen) return current;
                  const next = new Set(current);
                  if (isOpen) next.add(title); else next.delete(title);
                  return next;
                });
              }}
            >
              <summary>{title}<span className="nav-category-count">{keys.filter(key => byKey.has(key)).length}</span></summary>
              {keys.map(navLink)}
            </details>
          ))}
          {extra.length > 0 && (
            <details className="nav-group" open={openGroups.has('추가 운영 도구')} onToggle={event => {
              const isOpen = event.currentTarget.open;
              setOpenGroups(current => {
                if (current.has('추가 운영 도구') === isOpen) return current;
                const next = new Set(current);
                if (isOpen) next.add('추가 운영 도구'); else next.delete('추가 운영 도구');
                return next;
              });
            }}>
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
        <Link className="profile admin-profile-link" href="/my/profile" aria-label="내 회원 정보" onClick={() => setMobile(false)}>
          <span className="avatar">{(user.full_name || '운영').slice(0, 1)}</span>
          <div>
            <b>{user.full_name || '운영자'}</b>
            <div className="meta">{user.role === 'admin' ? '관리자' : '스태프'}</div>
          </div>
        </Link>
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
              <Link className="btn ghost small" href="/admin/questions">
                <MessageCircle aria-hidden="true" />
                질문함
              </Link>
            )}
            <button className="btn iconbtn ghost" onClick={() => void logout()} aria-label="로그아웃">
              <LogOut aria-hidden="true" />
            </button>
            <Link className="avatar admin-profile-link" href="/my/profile" aria-label="내 회원 정보" title="내 회원 정보">{(user.full_name || '운영').slice(0, 1)}</Link>
          </div>
        </header>
        {process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true' && <LearningNoticeBar/>}
        <div className={`content admin-content-${contentWidth}`} id="admin-content" tabIndex={-1}>
          {children}
        </div>
      </div>
    </>
  );
}
