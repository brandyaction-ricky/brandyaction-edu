const script = '/edu-push-sw.js';
let account: string | null | undefined, revision = 0;
function accountVersion(owner: string | null) { if (account !== owner) { account = owner; revision++; } return revision; }
function current(version: number) { if (version !== revision) throw new Error('로그인 계정이 바뀌었습니다. 알림 설정을 다시 확인해 주세요.'); }
export function pushSupported() { return typeof window !== 'undefined' && window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window; }
async function registration() {
  if (!pushSupported()) return null;
  const item = await navigator.serviceWorker.getRegistration('/');
  const worker = item?.active || item?.waiting || item?.installing;
  return worker && new URL(worker.scriptURL).pathname === script ? item! : null;
}
async function command(item: ServiceWorkerRegistration, body: object) {
  const worker = item.active || item.waiting || item.installing; if (!worker) throw new Error('알림 연결을 준비하지 못했습니다.');
  return new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel(), timeout = setTimeout(() => { channel.port1.close(); reject(new Error('기기 알림 설정을 확인하지 못했습니다.')); }, 3000);
    channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); if (event.data?.ok) resolve(); else reject(new Error('이 브라우저에 알림 설정을 저장하지 못했습니다.')); };
    worker.postMessage(body, [channel.port2]);
  });
}
async function api(body: object) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('/api/member/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '알림 설정을 확인하지 못했습니다.'); return data;
  } finally { clearTimeout(timeout); }
}
export async function synchronizePushAccount(owner: string | null) {
  const version = accountVersion(owner);
  const item = await registration(); current(version); if (item) await command(item, { action: 'ACCOUNT', owner });
}
export async function pushDeviceStatus(owner: string) {
  const version = accountVersion(owner);
  const item = await registration(); current(version); if (!item) return false;
  // Existing subscribers also need the updated completion-notification handler, without re-subscribing.
  if (typeof item.update === 'function') void item.update().catch(() => {});
  await command(item, { action: 'ACCOUNT', owner }); current(version);
  const sub = await item.pushManager.getSubscription(); if (!sub) return false;
  const data = await api({ action: 'status', endpoint: sub.endpoint });
  current(version);
  if (data.enabled && typeof data.binding === 'string' && Notification.permission === 'granted') {
    await command(item, { action: 'BIND', owner, binding: data.binding }); return true;
  }
  await command(item, { action: 'CLEAR' }); return false;
}
export async function enableDevicePush(owner: string, publicKey: string) {
  if (!pushSupported()) throw new Error('이 브라우저에서는 앱 알림을 사용할 수 없습니다.');
  const version = accountVersion(owner);
  // Request within the button gesture, before registration/network awaits.
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? '브라우저 설정에서 이 사이트의 알림을 허용해 주세요.' : '알림 허용을 선택하면 받을 수 있습니다.');
  current(version);
  const previous = await navigator.serviceWorker.getRegistration('/');
  const previousWorker = previous?.active || previous?.waiting || previous?.installing;
  if (previousWorker && new URL(previousWorker.scriptURL).pathname !== script) throw new Error('기존 앱 연결을 확인해야 합니다. 관리자에게 알려 주세요.');
  await navigator.serviceWorker.register(script, { scope: '/', updateViaCache: 'none' });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const item = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('알림 준비 시간이 초과됐습니다. 다시 시도해 주세요.')), 10000); })]).finally(() => clearTimeout(timeout));
  current(version); await command(item, { action: 'ACCOUNT', owner }); current(version);
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
  let sub = await item.pushManager.getSubscription();
  if (sub?.options.applicationServerKey) {
    const oldKey = new Uint8Array(sub.options.applicationServerKey);
    if (oldKey.length !== key.length || !oldKey.every((value, index) => value === key[index])) { await command(item, { action: 'CLEAR' }); if (!await sub.unsubscribe()) throw new Error('기존 알림 연결을 해제하지 못했습니다. 다시 시도해 주세요.'); sub = null; }
  }
  sub ||= await item.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  current(version);
  const json = sub.toJSON();
  const data = await api({ action: 'subscribe', endpoint: sub.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth });
  current(version);
  if (!data.enabled || typeof data.binding !== 'string') throw new Error('알림 등록 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
  await command(item, { action: 'BIND', owner, binding: data.binding });
}
export async function disableDevicePush() {
  accountVersion(null); revision++;
  const item = await registration(); if (!item) return;
  const sub = await item.pushManager.getSubscription();
  // Clear local identity first, including already displayed notifications.
  const clear = command(item, { action: 'CLEAR' });
  const results = await Promise.allSettled([clear, ...(sub ? [api({ action: 'unsubscribe', endpoint: sub.endpoint }), sub.unsubscribe()] : [])]);
  // Local revocation or server revocation must succeed even if device storage fails.
  const revoked = !sub ? results[0].status === 'fulfilled' : results.slice(1).some(result => result.status === 'fulfilled' && result.value !== false);
  if (!revoked) throw new Error('알림 연결 해제를 다시 확인해 주세요.');
}


// Local display check only. This does not send an answer or exercise server delivery.
export async function testDevicePush(owner: string) {
  const version = accountVersion(owner);
  const item = await registration(); current(version);
  if (!item || Notification.permission !== 'granted') throw new Error('이 기기의 알림을 먼저 켜 주세요.');
  await item.showNotification('브랜디에듀 알림 확인', {
    body: '이 알림이 보이면 이 기기의 알림 표시가 허용되어 있습니다.',
    tag: 'edu-device-display-test', icon: '/api/app-branding?icon=192',
  });
  current(version);
}
