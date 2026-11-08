import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { CampusAdminPage } from '@/lib/oauth-callback';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { getOperatorUser } from '@/lib/operator-permissions';

const menus = {
  '/admin/campus': { scope: 'members', label: '회원 관리' },
  '/admin/campus/study': { scope: 'products', label: '상품 관리' },
  '/admin/campus/webinars': { scope: 'marketing', label: '마케팅' },
} as const satisfies Record<CampusAdminPage, { scope: string; label: string }>;

export type PageQuery = Record<string, string | string[] | undefined>;

export async function campusAdminAccess(path: CampusAdminPage, query: PageQuery) {
  const user = await getAuthenticatedUser();
  if (!user) {
    const params = new URLSearchParams();
    for (const [key, raw] of Object.entries(query)) {
      for (const value of Array.isArray(raw) ? raw : [raw]) {
        if (typeof value === 'string') params.append(key, value);
      }
    }
    const next = path + (params.size ? '?' + params : '');
    redirect('/login?' + new URLSearchParams({ next }));
  }
  return getOperatorUser(menus[path].scope, user);
}

export function CampusAdminDenied({ path }: { path: CampusAdminPage }) {
  return <main className="container section-pad">
    <h1>이 메뉴를 볼 권한이 없습니다</h1>
    <p>현재 계정으로 로그인되어 있습니다. 이 메뉴를 이용하려면 관리자에게 {menus[path].label} 권한을 요청해 주세요.</p>
    <Link className="btn" href="/my">마이페이지로</Link>
  </main>;
}
