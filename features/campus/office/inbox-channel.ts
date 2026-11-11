import type { SupabaseClient } from '@supabase/supabase-js';

export async function readOfficeVersion(db: SupabaseClient, enrollment: string, signal: AbortSignal) {
  const {data, error} = await db.from('edu_campus_office_inbox_signals').select('version')
    .eq('enrollment_id', enrollment).abortSignal(signal).maybeSingle();
  if (error) throw error;
  return Number(data?.version ?? 0);
}

export async function joinOfficeInbox(
  db: SupabaseClient, enrollment: string, signal: AbortSignal,
  ready: () => void, failed: () => void, invalidate: () => void,
) {
  const { data } = await db.auth.getSession();
  if (signal.aborted) return;
  if (!data.session) { failed(); return; }
  await db.realtime.setAuth(data.session.access_token);
  if (signal.aborted) return;

  const channel = db.channel('office-inbox:' + enrollment + ':' + crypto.randomUUID());
  signal.addEventListener('abort', () => { void db.removeChannel(channel).catch(() => {}); }, { once: true });
  let version = 0;
  const scope = { schema: 'public', table: 'edu_campus_office_inbox_signals', filter: 'enrollment_id=eq.' + enrollment };
  const changed = (event: { new: { version?: number } }) => {
    const next = Number(event.new.version);
    if (!signal.aborted && next > version) { version = next; invalidate(); }
  };
  channel.on('postgres_changes', { ...scope, event: 'INSERT' }, changed)
    .on('postgres_changes', { ...scope, event: 'UPDATE' }, changed)
    .on('system', {}, msg => {
      if (msg.extension === 'postgres_changes') {
        if (msg.status === 'ok') ready();
        else failed();
      }
    })
    .subscribe(status => { if (status !== 'SUBSCRIBED') failed(); });
}
