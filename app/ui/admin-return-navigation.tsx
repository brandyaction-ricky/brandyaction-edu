'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { isAdminRoute } from '@/lib/admin-route';
import { uuid } from '@/lib/purchase-onboarding';

const ReturnNavigation = createContext<{ href?: string; onReturn: (href: string) => void } | null>(null);

function purchaseNoticeReturn(value: string | null) {
  if (!value?.startsWith('/admin/purchase-onboarding?')) return;
  const url = new URL(value, 'https://edu.invalid');
  const cohort = url.searchParams.get('cohort');
  const product = url.searchParams.get('product');
  if (!uuid(cohort) || (product !== null && !uuid(product))) return;
  const params = new URLSearchParams({ cohort });
  if (product) params.set('product', product);
  return '/admin/purchase-onboarding?' + params + '#buyer-delivery';
}

export function AdminReturnNavigation({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search.toString();
  const [trail, setTrail] = useState<{ pathname: string; href: string }[]>([]);
  const returning = useRef<string | null>(null);

  useEffect(() => {
    const supported = (pathname === '/admin' || pathname.startsWith('/admin/')) && isAdminRoute(pathname.split('/').filter(Boolean)) ||
      ['/admin/purchase-onboarding', '/admin/diagnosis/manage'].includes(pathname);
    if (!supported || pathname === '/admin/metrics') return;
    function remember() {
      const href = pathname + (query ? '?' + query : '') + window.location.hash;
      const returnPath = returning.current;
      returning.current = null;
      setTrail(current => {
        const last = current.at(-1);
        if (last?.href === href) return current;
        const entry = { pathname, href };
        if (last?.pathname === pathname) return [...current.slice(0, -1), entry];
        if (returnPath === pathname) {
          const previous = current.findLastIndex(item => item.pathname === pathname);
          return previous >= 0 ? [...current.slice(0, previous), entry] : [entry];
        }
        return [...current.slice(-19), entry];
      });
    }
    remember();
    window.addEventListener('hashchange', remember);
    return () => window.removeEventListener('hashchange', remember);
  }, [pathname, query]);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      if (event.isTrusted) returning.current = window.location.pathname;
    };
    window.addEventListener('popstate', onPop, true);
    return () => window.removeEventListener('popstate', onPop, true);
  }, []);

  const explicit = pathname === '/admin/templates' ? purchaseNoticeReturn(search.get('returnTo')) : undefined;
  const previous = trail.at(-1)?.pathname === pathname ? trail.at(-2) : trail.at(-1);
  return <ReturnNavigation.Provider value={{
    href: explicit ?? previous?.href,
    onReturn: href => { returning.current = new URL(href, window.location.origin).pathname; },
  }}>{children}</ReturnNavigation.Provider>;
}

export function AdminReturnLink({ fallback = '/admin', fallbackLabel = '운영 홈으로' }: { fallback?: string; fallbackLabel?: string }) {
  const navigation = useContext(ReturnNavigation);
  const href = navigation?.href ?? fallback;
  const label = href.startsWith('/admin/purchase-onboarding?') && href.endsWith('#buyer-delivery')
    ? '구매자 공지로 돌아가기' : navigation?.href ? '이전 관리 화면으로' : fallbackLabel;
  return <Link className="btn ghost small" href={href} replace onNavigate={() => navigation?.onReturn(href)}>← {label}</Link>;
}
