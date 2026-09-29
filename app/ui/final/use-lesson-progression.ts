"use client";
import { useEffect, useState } from 'react';
export type LessonGate = { lessonId: string; isUnlocked: boolean; automaticApproval: boolean; ongoing?: boolean; tagLabel?: string; track: 'daily' | 'learning' | null; dayNumber: number | null; reason: string };
export function useLessonProgression(enrollment: string, enabled: boolean) {
  const [refresh, setRefresh] = useState(0);
  const key = `${enrollment}:${refresh}`;
  const [loaded, setLoaded] = useState<{ key: string; lessons?: LessonGate[]; error?: string } | null>(null);
  useEffect(() => {
    if (!enabled || !enrollment) return;
    const abort = new AbortController();
    void fetch('/api/platform/lesson-blocks?' + new URLSearchParams({ action: 'progression', enrollment }), { cache: 'no-store', signal: abort.signal })
      .then(async response => {
        const data = await response.json(); if (!response.ok) throw new Error(data.error || '학습 개방 상태를 확인하지 못했습니다.');
        if (!Array.isArray(data.lessons) || data.lessons.some((row: LessonGate) => !row || typeof row.lessonId !== 'string' || typeof row.isUnlocked !== 'boolean' || (row.tagLabel !== undefined && (typeof row.tagLabel !== 'string' || row.tagLabel.length > 100)))) throw new Error('학습 개방 상태를 확인하지 못했습니다.');
        return data.lessons as LessonGate[];
      }).then(lessons => { if (!abort.signal.aborted) setLoaded({ key, lessons }); })
      .catch(error => { if (!abort.signal.aborted) setLoaded({ key, error: error.message }); });
    return () => abort.abort();
  }, [enrollment, enabled, key]);
  return { lessons: loaded?.key === key ? loaded.lessons : undefined, error: loaded?.key === key ? loaded.error : undefined, reload: () => setRefresh(value => value + 1) };
}
