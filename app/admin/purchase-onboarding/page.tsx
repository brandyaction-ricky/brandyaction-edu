import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOperatorUser } from '@/lib/operator-permissions';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { PurchaseOnboardingAdmin } from '@/app/ui/purchase-onboarding-admin';
import { uuid } from '@/lib/purchase-onboarding';

export const metadata: Metadata = { title: '결제 후 안내 설정 | 브랜디에듀', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ product?: string | string[]; cohort?: string | string[] }> }) {
  const { product, cohort } = await searchParams;
  if (product !== undefined && !uuid(product)) redirect('/admin/products');
  const query = new URLSearchParams();
  if (product) query.set('product', product);
  if (uuid(cohort)) query.set('cohort', cohort);
  const destination = '/admin/purchase-onboarding' + (query.size ? '?' + query : '');
  const account = await getAuthenticatedUser();
  if (!account) redirect('/login?next=' + encodeURIComponent(destination));
  const user = await getOperatorUser('products', account);
  if (!user?.permissions.orders) return <main className="edu-front purchase-onboarding"><div className="wrap narrow"><h1>접근 권한이 없습니다.</h1><p>결제 후 안내 설정은 상품과 주문 관리 권한을 가진 운영자만 사용할 수 있습니다.</p></div></main>;
  return <PurchaseOnboardingAdmin key={product || 'all'} productId={product} initialCohort={uuid(cohort) ? cohort : undefined} />;
}
