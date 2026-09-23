import { notFound, redirect } from 'next/navigation';
import { isAdminRoute } from '@/lib/admin-route';
import { metricsRedirect } from '@/lib/landing-admin-state';

export default async function AdminPage({ params, searchParams }: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { path = [] } = await params;
  if (!isAdminRoute(['admin', ...path])) notFound();
  if (path[0] === 'metrics') redirect(metricsRedirect(await searchParams));
  return null;
}
