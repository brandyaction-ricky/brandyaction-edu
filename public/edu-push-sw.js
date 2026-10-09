/* Push only: never intercept or cache authenticated pages or responses. */
const allowedPaths = new Set(['/my/messages', '/my/questions', '/admin/questions', '/my/diagnosis', '/admin/diagnosis']);
const allowedPath = value => typeof value === 'string' && (allowedPaths.has(value) || /^\/my\/questions\?question=[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value));
const isId = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
async function bindingStore(write, value) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('edu-push-device', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('Device storage unavailable'));
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('settings', write ? 'readwrite' : 'readonly'), store = transaction.objectStore('settings');
      const request = write ? store.put(value, 'binding') : store.get('binding');
      transaction.oncomplete = () => resolve(write ? value : request.result);
      transaction.onerror = transaction.onabort = () => reject(new Error('Device storage unavailable'));
    });
  } finally { db.close(); }
}
let changes = Promise.resolve();
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  event.waitUntil(changes = changes.catch(() => {}).then(async () => {
    const source = event.source?.id ? await self.clients.get(event.source.id) : null;
    if (!source || new URL(source.url).origin !== self.location.origin) return;
    const data = event.data;
    try {
      if (data?.action === 'BIND' && isId(data.owner) && isId(data.binding)) {
        const stored = await bindingStore(false);
        if (stored?.owner !== data.owner) throw new Error('Account changed');
        await bindingStore(true, { owner: data.owner, binding: data.binding });
      }
      else if (data?.action === 'CLEAR') {
        const stored = await bindingStore(false); await bindingStore(true, stored ? { owner: stored.owner, binding: null } : null);
      }
      else if (data?.action === 'ACCOUNT' && (data.owner === null || isId(data.owner))) {
        const stored = await bindingStore(false);
        if (stored?.owner !== data.owner) {
          await bindingStore(true, data.owner ? { owner: data.owner, binding: null } : null);
          if (stored?.binding) { const sub = await self.registration.pushManager.getSubscription(); if (sub) await sub.unsubscribe().catch(() => false); }
        }
      } else return;
      if (!(await bindingStore(false))?.binding) for (const notification of await self.registration.getNotifications()) notification.close();
      event.ports[0]?.postMessage({ ok: true });
    } catch { event.ports[0]?.postMessage({ ok: false }); }
  }));
});
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data; try { data = event.data?.json(); } catch { return; }
    if (data?.version !== 1 || !isId(data.binding) || !isId(data.eventId) || !allowedPath(data.path)) return;
    await changes.catch(() => {}); const stored = await bindingStore(false);
    if (!stored || stored.binding !== data.binding) return;
    await self.registration.showNotification('브랜디에듀', {
      body: data.path === '/my/diagnosis' || data.path === '/admin/diagnosis'
        ? 'N6 보고서가 완성됐어요. 눌러서 보고서를 확인해 주세요.'
        : data.path === '/my/messages' ? '학습 안내가 도착했어요. 눌러서 메시지함을 확인해 주세요.'
        : '질문·답변 소식이 있습니다. 로그인해서 확인해 주세요.',
      tag: 'edu-' + data.eventId, renotify: false,
      icon: '/api/app-branding?icon=192', badge: '/icons/edu-badge-96.png',
      data: { binding: data.binding, path: data.path },
    });
  })().catch(() => {}));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    await changes.catch(() => {});
    const data = event.notification.data, stored = await bindingStore(false);
    if (!stored || stored.binding !== data?.binding || !allowedPath(data?.path)) return;
    const url = new URL(data.path, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const target = windows.find(client => new URL(client.url).origin === self.location.origin && 'navigate' in client);
    if (target) { const navigated = await target.navigate(url); if (navigated) await navigated.focus(); }
    else await self.clients.openWindow(url);
  })().catch(() => {}));
});
