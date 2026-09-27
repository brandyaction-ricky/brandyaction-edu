import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOperatorUser } from '@/lib/operator-permissions';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { PurchaseOnboardingAdmin } from '@/app/ui/purchase-onboarding-admin';

export const metadata: Metadata = { title: '결제 후 안내 설정 | 브랜디에듀', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const account = await getAuthenticatedUser();
  if (!account) redirect('/login?next=%2Fadmin%2Fpurchase-onboarding');
  const user = await getOperatorUser('products', account);
  if (!user?.permissions.orders) return <main className="edu-front purchase-onboarding"><div className="wrap narrow"><h1>접근 권한이 없습니다.</h1><p>결제 후 안내 설정은 상품과 주문 관리 권한을 가진 운영자만 사용할 수 있습니다.</p></div></main>;
  return <PurchaseOnboardingAdmin />;
}
