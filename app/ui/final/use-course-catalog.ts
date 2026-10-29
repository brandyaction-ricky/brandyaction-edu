'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { catalogTypes, type CatalogType } from '@/lib/course-catalog';
import type { Row } from '@/lib/platform';

export function useCatalogLocation(enabled: boolean, counts?: Row) {
  const router = useRouter(), search = useSearchParams();
  const source = search.toString();
  const requested = search.get('type') || '';
  const type = Object.hasOwn(catalogTypes, requested) ? requested as CatalogType : '';
  const filter = type ? catalogTypes[type] : '전체';
  const query = (search.get('q') || '').slice(0, 80);
  const page = Math.max(1, Math.min(100000, Number.parseInt(search.get('page') || '1', 10) || 1));
  const [draft, setDraft] = useState({ source, value: query });
  const input = draft.source === source ? draft.value : query;
  const navigate = useCallback((values: Record<string, string>, replace = false) => {
    const params = new URLSearchParams(source);
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value); else params.delete(key);
    }
    const url = '/classes' + (params.size ? '?' + params : '');
    if (replace) router.replace(url, { scroll: false }); else router.push(url, { scroll: false });
  }, [router, source]);
  useEffect(() => {
    if (!enabled || input === query) return;
    const timer = setTimeout(() => navigate({ q: input.trim(), page: '' }, true), 300);
    return () => clearTimeout(timer);
  }, [enabled, input, query, navigate]);
  useEffect(() => {
    if (!enabled || !requested) return;
    if (!type || (counts && counts[type] === 0)) navigate({ type: '', page: '' }, true);
  }, [enabled, requested, type, counts, navigate]);
  return { type, filter, query, page, input,
    setInput: (value: string) => setDraft({ source, value: value.slice(0, 80) }),
    setType: (value: string) => navigate({ type: value, page: '', q: input.trim() }),
    setPage: (value: number) => navigate({ page: value > 1 ? String(value) : '' }),
    clear: () => navigate({ type: '', q: '', page: '' }),
  };
}

export function useCatalogClock(cohorts: Row[], enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  const deadlines = JSON.stringify(cohorts.flatMap(row => [row.recruitment_start_at, row.recruitment_end_at, row.operation_end_at]).filter(Boolean));
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      const next = Math.min(current + 30000, ...(JSON.parse(deadlines) as string[]).map(Date.parse).filter(value => value > current));
      timer = setTimeout(tick, Math.max(1, next - current));
    };
    const restore = () => { clearTimeout(timer); tick(); };
    tick();
    document.addEventListener('visibilitychange', restore);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', restore); };
  }, [deadlines, enabled]);
  return now;
}
