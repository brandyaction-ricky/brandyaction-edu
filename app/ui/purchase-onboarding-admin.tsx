'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CompletionGuideSettings } from '@/lib/purchase-onboarding';
import { AdminReturnLink } from './admin-return-navigation';
import { PurchaseBuyerDelivery } from './purchase-buyer-delivery';
import './purchase-onboarding.css';

type Cohort = { id: string; name: string; courses: { title: string } | { title: string }[] | null };
const empty: CompletionGuideSettings = { label: '', url: '' };
const endpoint = '/api/admin/purchase-onboarding';
const courseTitle = (cohort?: Cohort) => Array.isArray(cohort?.courses) ? cohort.courses[0]?.title : cohort?.courses?.title;

export function PurchaseOnboardingAdmin({ productId, initialCohort }: { productId?: string; initialCohort?: string }) {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [chosenCohort, setChosenCohort] = useState<string>();
  const requestedCohort = chosenCohort ?? initialCohort;
  const cohort = cohorts.some(item => item.id === requestedCohort) ? requestedCohort! : '';
  const scrolledToDelivery = useRef(false);
  const [settings, setSettings] = useState<CompletionGuideSettings>(empty);
  const [listLoading, setListLoading] = useState(true);
  const [loadedCohort, setLoadedCohort] = useState('');
  const loaded = !!cohort && cohort === loadedCohort;
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const query = productId ? '?' + new URLSearchParams({ product: productId }) : '';
    void fetch(endpoint + query, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw Error(result.error || '기수를 불러오지 못했습니다.');
      if (!controller.signal.aborted) setCohorts(result.cohorts || []);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '기수를 불러오지 못했습니다.');
    }).finally(() => { if (!controller.signal.aborted) setListLoading(false); });
    return () => controller.abort();
  }, [productId]);

  useEffect(() => {
    if (!cohort) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ cohort });
    if (productId) params.set('product', productId);
    void fetch(endpoint + '?' + params, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw Error(result.error || '설정을 불러오지 못했습니다.');
      if (!controller.signal.aborted) {
        setSettings(result.settings || empty);
        setLoadedCohort(cohort);
      }
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '설정을 불러오지 못했습니다.');
    });
    return () => controller.abort();
  }, [cohort, productId]);

  useEffect(() => {
    if (cohort && !scrolledToDelivery.current && window.location.hash === '#buyer-delivery') {
      scrolledToDelivery.current = true;
      document.getElementById('buyer-delivery')?.scrollIntoView();
    }
  }, [cohort]);

  function chooseCohort(id: string) {
    setChosenCohort(id);
    setLoadedCohort('');
    setMessage('');
    setError('');
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('cohort', id);
    else url.searchParams.delete('cohort');
    window.history.replaceState(null, '', url);
  }
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cohort || !loaded || pending) return;
    setPending(true); setMessage(''); setError('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product: productId, cohort, settings }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || '저장하지 못했습니다.');
      setSettings(result.settings);
      setMessage(result.settings.url ? '결제 완료 화면에 안내 링크를 표시합니다.' : '안내 링크를 표시하지 않도록 저장했습니다.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.'); }
    finally { setPending(false); }
  };
  return <main className="edu-front purchase-onboarding"><div className="wrap narrow">
    <AdminReturnLink fallback={productId ? '/admin/product-editor?id=' + encodeURIComponent(productId) : '/admin/products'} fallbackLabel={productId ? '상품 수정' : '상품 관리'} />
    <p className="eyebrow mt24">PURCHASE ONBOARDING</p><h1>결제 후 안내 설정</h1>
    {productId && courseTitle(cohorts[0]) && <p className="lead">{courseTitle(cohorts[0])}</p>}
    {cohort && <nav className="onboarding-actions" aria-label="결제 후 안내 관리"><a className="btn" href="#completion-settings">완료 화면 설정</a><a className="btn" href="#buyer-delivery">구매자 공지·발송 내역</a></nav>}
    <section id="completion-settings" className="onboarding-panel">
      <h2>1. 결제 완료 화면</h2>
      <label>안내할 기수<select value={cohort} disabled={pending || listLoading} onChange={event => chooseCohort(event.target.value)}>
        <option value="">{listLoading ? '기수를 불러오는 중' : '기수를 선택하세요'}</option>
        {cohorts.map(item => <option key={item.id} value={item.id}>{productId ? item.name : `${courseTitle(item) || '상품'} · ${item.name}`}</option>)}
      </select></label>
      {!listLoading && !error && !cohorts.length && <p className="meta">안내를 설정할 유료 클래스 기수가 없습니다.</p>}
      {cohort && loaded && <form className="onboarding-admin-fields" onSubmit={save}>
        <label>안내 링크 이름<input value={settings.label} disabled={pending} maxLength={80} placeholder="예: 문샷 공부방 입장하기" onChange={event => setSettings(current => ({ ...current, label: event.target.value }))} /></label>
        <label>안내 링크<input type="url" value={settings.url} disabled={pending} maxLength={1800} placeholder="https://…" onChange={event => setSettings(current => ({ ...current, url: event.target.value }))} /></label>
        <p className="meta">저장하면 결제한 수강생에게 이 링크를 보여 줍니다. 안내를 끄려면 두 칸을 비우고 저장하세요.</p>
        <button className="btn primary" type="submit" disabled={pending}>설정 저장</button>
      </form>}
      {message && <p role="status" className="notice">{message}</p>}{error && <p role="alert" className="notice">{error}</p>}
    </section>
    {cohort && <PurchaseBuyerDelivery key={cohort} cohort={cohort} productId={productId} />}
  </div></main>;
}
