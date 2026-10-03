'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Compass } from 'lucide-react';
import type { DiagnosisOffer } from '@/lib/diagnosis-session';
import './diagnosis-entry.css';

type Entry = { state: string; courseId?: string };
/** Hidden until the complete questionnaire/report rollout is explicitly enabled. */
export function DiagnosisEntry({ courseId, navigation=false }: { courseId?: string; navigation?: boolean }) {
  const [entry, setEntry] = useState<Entry | null>(null);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_EDU_MYIN_DIAGNOSIS_ENABLED !== 'true') return;
    const controller = new AbortController();
    void fetch('/api/platform/diagnosis/session?view=catalog', { cache: 'no-store', signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(data => {
        if (controller.signal.aborted || !Array.isArray(data?.offers)) return;
        const offer = data.offers.find((item: DiagnosisOffer) => !courseId || item.courseId === courseId);
        if (!offer) return;
        setEntry({ state: data.current?.state ?? 'not_started', courseId: offer.courseId });
      }).catch(() => { /* A temporary diagnosis outage must not interrupt learning. */ });
    return () => controller.abort();
  }, [courseId]);
  if (!entry || (courseId && entry.courseId !== courseId)) return null;
  if (navigation) return <Link href="/my/diagnosis"><Compass size={20} aria-hidden="true"/>N6 진단 받기</Link>;
  const submitted = ['submitted', 'processing', 'ready'].includes(entry.state);
  const label = entry.state === 'not_started' ? '검사 시작하기' : submitted ? '제출한 검사 확인' : '검사 이어하기';
  return <section className="diagnosis-entry" aria-label="N6 검사">
    <span className="diagnosis-entry-icon"><Compass size={22}/></span>
    <div><h2>나를 이해하는 N6 검사</h2><p>{submitted ? '제출한 검사와 결과 준비 상태를 확인하세요.' : '나의 욕구와 행동 경향을 알아보세요. 중간에 쉬었다 이어서 할 수 있어요.'}</p></div>
    <Link className="btn small" href={`/my/diagnosis?course=${encodeURIComponent(entry.courseId || '')}`}>{label}<ArrowRight size={16}/></Link>
  </section>;
}
