'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { labels, object, text, type Row } from '@/lib/platform';

const views = [['students', '수강생'], ['missions', '미션 제출'], ['blocks', '학습 본문 제출'], ['questions', '질문함']] as const;
type View = typeof views[number][0];
type Result = { rows: Row[]; total: number; page: number; pageSize: number };
export function ProductStudentsWorkspace({ courseId, cohorts, actorId, allowed }: { courseId?: string; cohorts: Row[]; actorId?: string; allowed: boolean }) {
  const [view, setView] = useState<View>('students'), [cohort, setCohort] = useState(''), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; data?: Result; error?: string }>();
  const key = JSON.stringify([actorId, courseId, view, cohort, page, revision, allowed]);
  useEffect(() => {
    if (!courseId || !allowed) return;
    const abort = new AbortController();
    const query = new URLSearchParams({ course: courseId, view, page: String(page), ...(cohort ? { cohort } : {}) });
    void fetch('/api/admin/product-students?' + query, { cache: 'no-store', signal: abort.signal })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || '조회 결과를 확인하지 못했습니다.'); if (!abort.signal.aborted) setLoaded({ key, data: result }); })
      .catch(error => { if (!abort.signal.aborted) setLoaded({ key, error: error.message }); });
    return () => abort.abort();
  }, [actorId, courseId, view, cohort, page, revision, key, allowed]);
  if (!courseId) return <p className="notice">상품을 먼저 저장한 뒤 수강생과 제출·질문을 확인할 수 있습니다.</p>;
  if (!allowed) return <p className="notice">수강생과 제출·질문을 보려면 회원 관리 권한이 필요합니다.</p>;
  const result = loaded?.key === key ? loaded : undefined;
  const list = result?.data;
  function changeView(next: View) { setView(next); setPage(1); }
  return <section aria-label="상품 수강생 운영">
    <h2>수강생·제출·질문</h2><p className="meta">이 상품의 기존 기록을 확인합니다. 상세 검토는 새 창에서 열립니다.</p>
    <div className="row mt16"><label className="field">조회 기수<select aria-label="조회 기수" value={cohort} onChange={event => { setCohort(event.target.value); setPage(1); }}><option value="">전체 기수</option>{cohorts.map(row => <option key={row.id} value={row.id}>{text(row, 'name')}</option>)}</select></label><button className="btn small" type="button" onClick={() => setRevision(value => value + 1)}>운영 기록 새로고침</button></div>
    <div className="row mt16" aria-label="수강생 운영 조회">{views.map(([value, label]) => <button key={value} type="button" className={'btn small' + (view === value ? ' primary' : '')} aria-pressed={view === value} onClick={() => changeView(value)}>{label}</button>)}</div>
    {result?.error ? <p role="alert" className="notice mt16">{result.error} <button type="button" className="btn small" onClick={() => setRevision(value => value + 1)}>다시 불러오기</button></p> : !list ? <p role="status" className="mt16">운영 기록을 불러오는 중입니다.</p> : <>
      <p role="status" className="meta mt16">전체 {list.total}건 · {page}페이지</p>
      {!list.rows.length && <p className="notice">선택한 상품·기수의 기록이 없습니다.</p>}
      <div className="product-student-list">{list.rows.map(row => {
        const enrollment = view === 'students' ? row : object(row, 'enrollments') as Row;
        const profile = object(view === 'questions' ? row : enrollment, 'profiles') as Row;
        const name = text(profile, 'full_name') || '이름 미등록';
        const member = view === 'questions' ? row.user_id : enrollment.user_id;
        const href = view === 'students' ? '/admin/customers?member=' + member : view === 'questions' ? '/admin/questions?question=' + row.id : '/admin/reviews?' + new URLSearchParams(view === 'blocks' ? { tab: 'blocks', block: row.id } : { submission: row.id });
        return <article className="notice mt16" key={row.id}><b>{name}</b><p>{view === 'students' ? text(object(row, 'cohorts') as Row, 'name') : view === 'questions' ? text(row, 'title') : view === 'missions' ? text(object(row, 'curriculum_missions') as Row, 'title') || '미션 제출' : '학습 본문 제출 기록'}</p><p className="meta">{view === 'blocks' ? '제출 당시 상태: ' + (labels[text(row, 'outcome')] || text(row, 'outcome')) + ' · 최신 검토 결과는 상세에서 확인' : labels[text(row, 'status')] || text(row, 'status')}{row.created_at || row.submitted_at ? ' · ' + new Date(String(row.submitted_at || row.created_at)).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : ''}</p><Link className="btn small" href={href} target="_blank" rel="noopener noreferrer">{view === 'students' ? '회원 미션 현황' : '상세 검토'}</Link>{view === 'students' && Boolean(enrollment.cohort_id) && <Link className="btn small" href={'/admin/learning-care?cohort=' + enrollment.cohort_id} target="_blank" rel="noopener noreferrer">학습 현황</Link>}</article>;
      })}</div>
      <div className="row mt16"><button type="button" className="btn small" disabled={page === 1} onClick={() => setPage(value => value - 1)}>이전 기록</button><button type="button" className="btn small" disabled={page * list.pageSize >= list.total} onClick={() => setPage(value => value + 1)}>다음 기록</button></div>
    </>}
  </section>;
}
