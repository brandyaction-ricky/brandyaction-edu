import type { Page } from '@playwright/test';
const version = 'synthetic-meta-v1';
const terms = {
  version, recipient: '합성 Meta 수신자', country: '합성 이전 국가', items: '합성 구매 내역', purpose: '합성 광고 성과 측정',
  transfer: '합성 이전 방식', retention: '합성 보유 기간', refusal: '동의하지 않아도 쿠폰 조건은 같습니다.', contact: '합성 문의처',
};
export async function metaBackend(page: Page, options: { existing?: boolean; lost?: boolean; renewal?: boolean; unavailable?: boolean; conflict?: boolean } = {}) {
  const writes: { requestId: string; expectedRevision: string | null; consented: boolean; wordingVersion: string | null; surface: string }[] = [];
  let saved = { consented: !!options.existing, revision: options.existing ? '33333333-3333-4333-8333-333333333333' : null as string | null };
  let lost = options.lost;
  const receipts = new Map<string, unknown>();
  const snapshot = () => ({ ...saved, active: saved.consented && !options.renewal && !options.unavailable, needsRenewal: !!options.renewal && saved.consented, updatedAt: null, terms: options.unavailable ? null : terms });
  await page.route('**/api/account/meta-purchase-consent', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: snapshot() });
    const body = route.request().postDataJSON(); writes.push(body);
    if (!receipts.has(body.requestId)) {
      if (options.conflict || body.expectedRevision !== saved.revision) return route.fulfill({ status: 409, json: { error: '다른 화면에서 Meta 동의가 바뀌었어요.' } });
      saved = { consented: body.consented, revision: body.requestId }; receipts.set(body.requestId, snapshot());
    }
    if (lost) { lost = false; return route.abort(); }
    return route.fulfill({ json: receipts.get(body.requestId) });
  });
  return writes;
}
