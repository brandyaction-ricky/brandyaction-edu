'use client';

import { useEffect, useState } from 'react';
import type { Row } from '@/lib/platform';

export type ReviewSubmission = Row & { member?: Row; mission?: Row; course?: Row };
type ReviewPage = {
  rows: ReviewSubmission[];
  pagination: { page: number; pageSize: number; total: number };
  counts: Record<string, number>;
};

export function useReviewQueue(enabled: boolean, params: URLSearchParams) {
  const [revision, setRevision] = useState(0);
  const key = params.toString();
  const requestKey = key + ':' + revision;
  const [state, setState] = useState<{ key: string; result?: ReviewPage; error?: string }>({ key: '' });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch('/api/mission/reviews?' + key, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '제출물을 불러오지 못했습니다.');
        if (!controller.signal.aborted) setState({ key: requestKey, result });
      }).catch(error => {
        if (!controller.signal.aborted) setState({ key: requestKey, error: error.message });
      });
    return () => controller.abort();
  }, [enabled, key, requestKey]);
  const current = state.key === requestKey ? state : null;
  return {
    result: current?.result, error: current?.error,
    loading: enabled && !current,
    reload: () => setRevision(value => value + 1),
  };
}
