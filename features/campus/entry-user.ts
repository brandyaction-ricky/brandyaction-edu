import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/server-auth';

export type EntryQuery = Record<string, string | string[] | undefined>;

export async function campusUser(path: string, query: EntryQuery = {}) {
  const user = await getAuthenticatedUser();
  if (user) return user;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') params.set(key, value);
  }
  const destination = params.size ? path + '?' + params : path;
  redirect('/login?' + new URLSearchParams({ next: destination }));
}
