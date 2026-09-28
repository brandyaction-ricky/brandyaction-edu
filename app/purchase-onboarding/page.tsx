import type { Metadata } from 'next';
import { PurchaseOnboarding } from '@/app/ui/purchase-onboarding';

export const metadata: Metadata = { title: '결제 후 안내 | 브랜디에듀', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ order?: string; step?: string }> }) {
  const params = await searchParams;
  return <PurchaseOnboarding order={params.order || ''} guideRequested={params.step === 'guide'} />;
}
