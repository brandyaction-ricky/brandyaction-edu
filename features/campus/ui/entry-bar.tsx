'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import type {CampusScope} from '../contracts';
import {campusReviewPath} from '../operator-access';
import {campusReturnPath, campusSourceLesson} from './navigation';
import styles from './entry.module.css';

type Props = { returnTo?: string; fromLesson?: string; enrollmentId?: string; reviewCohort?: string };
export function CampusEntryBar({ returnTo, fromLesson, enrollmentId, reviewCohort }: Props = {}) {
 const previous = campusReturnPath(returnTo || null);
 const previousEnrollment = previous && new URL(previous, 'https://campus.invalid').searchParams.get('enrollmentId');
 const back = previous && (enrollmentId ? previousEnrollment === enrollmentId : !reviewCohort) ? previous : null;
 const [scopes, setScopes] = useState<CampusScope[] | null>(null);
 const [failed, setFailed] = useState(false);
 const [attempt, setAttempt] = useState(0);
 useEffect(() => {
  if (back) return;
  const controller = new AbortController();
  void fetch('/api/campus', {cache:'no-store',credentials:'same-origin',signal:controller.signal})
   .then(async response => {
    if (response.status === 401 || response.status === 403 || response.status === 404) return null;
    if (!response.ok) throw Error();
    const data = await response.json();
    if (!Array.isArray(data.scopes)) throw Error();
    return data.scopes as CampusScope[];
   })
   .then(result => { if (!controller.signal.aborted) { setScopes(result); setFailed(false); } })
   .catch(() => { if (!controller.signal.aborted) { setScopes(null); setFailed(true); } });
  return () => controller.abort();
 }, [back, attempt]);

 if (back) return <nav className={styles.bar} aria-label="문샷 캠퍼스 바로가기"><strong>문샷 캠퍼스</strong><Link href={back}>← 캠퍼스로 돌아가기</Link></nav>;
 if (failed) return <nav className={styles.bar} aria-label="문샷 캠퍼스 바로가기"><span role="status">캠퍼스 이용 권한을 확인하지 못했어요.</span><button type="button" onClick={() => { setFailed(false); setAttempt(n => n + 1); }}>다시 확인</button></nav>;
 if (!scopes) return null;
 const scope = scopes.find(s => s.enrollmentId === enrollmentId && (!reviewCohort || s.cohortId === reviewCohort));
 if (reviewCohort && !scope) return <nav className={styles.bar} aria-label="문샷 캠퍼스 바로가기"><strong>문샷 캠퍼스</strong><span>이 기수에서는 운영자 미리보기를 이용할 수 있어요.</span><Link href={campusReviewPath(reviewCohort)}>캠퍼스 미리보기 →</Link></nav>;
 if (enrollmentId ? !scope : !scopes.length) return null;
 const query = new URLSearchParams({enrollmentId: scope?.enrollmentId || '', section: 'space'});
 const lesson = scope && campusSourceLesson(fromLesson || null, scope.enrollmentId);
 if (lesson) query.set('fromLesson', lesson);
 const href = scope ? '/campus/workspace?' + query : '/campus/enter';
 return <nav className={styles.bar} aria-label="문샷 캠퍼스 바로가기"><strong>문샷 캠퍼스</strong>{scope && <span>{scope.courseTitle} · {scope.cohortName}</span>}<Link href={href}>작업 공간 입장 →</Link></nav>;
}
