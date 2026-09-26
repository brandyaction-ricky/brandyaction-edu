import type { Metadata } from 'next';
import { AdminWorkspace } from '@/app/ui/admin-workspace';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '운영 관리 | BrandyAction EDU', robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminWorkspace>{children}</AdminWorkspace>;
}
