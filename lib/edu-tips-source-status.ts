type Counts = { registration_pending: number; registration_attention: number; projection_pending: number; projection_attention: number; withdrawal_pending: number; withdrawal_attention: number; unclassified: number };
export type SourceSnapshot = Counts & { state: 'attention' | 'pending' | 'idle' | 'paused' };
const counts = ['registration_pending', 'registration_attention', 'projection_pending', 'projection_attention', 'withdrawal_pending', 'withdrawal_attention', 'unclassified'] as const;
const flags = ['identity_enabled', 'publisher_enabled', 'withdrawal_enabled'] as const;
export function classifySourceStatus(data: unknown): SourceSnapshot {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== counts.length + flags.length) throw new Error('TIPS_SOURCE_STATUS_INVALID');
  const d = data as Record<string, unknown>;
  for (const k of counts) if (!Number.isSafeInteger(d[k]) || Number(d[k]) < 0) throw new Error('TIPS_SOURCE_STATUS_INVALID');
  for (const k of flags) if (typeof d[k] !== 'boolean') throw new Error('TIPS_SOURCE_STATUS_INVALID');
  for (const [a, p] of [['registration_attention', 'registration_pending'], ['projection_attention', 'projection_pending'], ['withdrawal_attention', 'withdrawal_pending']]) if (Number(d[a]) > Number(d[p])) throw new Error('TIPS_SOURCE_STATUS_INVALID');
  const attention = Number(d.registration_attention) + Number(d.projection_attention) + Number(d.withdrawal_attention) + Number(d.unclassified);
  const pending = Number(d.registration_pending) + Number(d.projection_pending) + Number(d.withdrawal_pending);
  const state = attention ? 'attention' : pending ? 'pending' : flags.every(k => !d[k]) ? 'paused' : 'idle';
  return { ...Object.fromEntries(counts.map(k => [k, d[k]])) as Counts, state };
}
