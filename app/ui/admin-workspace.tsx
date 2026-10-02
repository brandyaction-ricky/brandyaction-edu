'use client';

import { usePathname } from 'next/navigation';
import { isAdminRoute } from '@/lib/admin-route';
import { Platform } from './platform';

// This layout stays mounted across admin routes; page children retain server
// validation, legacy redirects and not-found handling.
export function AdminWorkspace({ children }: { children: React.ReactNode }) {
  const path = usePathname().split('/').filter(Boolean);
  return <>{isAdminRoute(path) && !['metrics', 'diagnosis'].includes(path[1]) && <Platform path={path} user={null} />}{children}</>;
}
