// Only replaceable scene state is coalesced. Actions must always be delivered.
const stateTypes = new Set(['ui-blocked', 'profile', 'peers', 'progress', 'controls', 'exhibition', 'presentation', 'focus-status', 'desk-seat']);
export function shouldSendWorldState(cache: Map<string, string>, type: string, payload: Record<string, unknown>) {
  if (!stateTypes.has(type)) return true;
  const signature = JSON.stringify(payload);
  if (cache.get(type) === signature) return false;
  cache.set(type, signature);
  return true;
}
