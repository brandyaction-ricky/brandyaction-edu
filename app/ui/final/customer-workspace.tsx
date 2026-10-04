"use client";

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { AdminTabs, AdminButton, AdminLinkButton, AdminLoadingState, AdminInlineError, AdminEmptyState, AdminPagination, AdminStatusBadge } from '@/features/admin-ui';
import { labels, object, text as t, type Row } from '@/lib/platform';
import { MvpEditor } from './member-mvp';
import { AdminLearningProgress } from './admin-learning-progress';
import { AdminLearningUsage } from './admin-learning-usage';
import { MemberVisits } from './member-visits';
import { MemberConversation } from './member-conversation';
import { AdminLoginEmailChange } from './admin-login-email-change';

const recordDate = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' });
function timeLabel(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  return date && !Number.isNaN(date.getTime()) ? `${recordDate.format(date)} KST` : '—';
}

const tabs = [
  { value: 'profile', label: '프로필' }, { value: 'enrollments', label: '수강권' },
  { value: 'progress', label: '학습 기록' }, { value: 'submissions', label: '제출물' },
  { value: 'questions', label: '질문' }, { value: 'history', label: '운영 이력' },
] as const;
const related = (row: Row, key: string) => object(row, key) as Row;
export function enrollmentLabel(row: Row, now = Date.now()) {
  if (row.status !== 'active') return labels[t(row, 'status')] || t(row, 'status');
  if (row.access_ends_at && Date.parse(t(row, 'access_ends_at')) <= now) return '기간 만료';
  if (row.access_starts_at && Date.parse(t(row, 'access_starts_at')) > now) return '시작 전';
  return '수강 가능';
}

export function CustomerWorkspace({ member, tab, onTabChange, children, blockLearningEnabled = process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true', conversationEnabled = process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED === 'true' && process.env.NEXT_PUBLIC_EDU_QUESTION_THREADS_ENABLED === 'true' }: { member: Row; tab: string; onTabChange: (value: string) => void; children: ReactNode; blockLearningEnabled?: boolean; conversationEnabled?: boolean }) {
  const profileChildren = <>{children}{member.role === 'student' && <AdminLoginEmailChange key={member.id} member={String(member.id)}/>}</>;
  return <div className="customer-workspace">
    <div className="drawer-profile"><span className="avatar red" aria-hidden="true">{(t(member, 'full_name') || '회').slice(0, 1)}</span><div><h2>{t(member, 'full_name') || '이름 미등록'}</h2><p>로그인 이메일 · {t(member, 'email') || '미등록'}</p><small>회원 ID · {member.id}</small></div></div>
    <AdminTabs label="회원 운영 정보" items={conversationEnabled ? [...tabs, { value: 'conversation', label: '대화 기록' }] : tabs} value={tab} onChange={onTabChange}>{value => value === 'profile' ? <>{profileChildren}{blockLearningEnabled && <MvpEditor key={member.id} member={member.id} name={t(member, 'full_name') || '회원'}/>}</> : value === 'history' ? <>{blockLearningEnabled && <MemberVisits key={member.id} member={member.id}/>}<div className="notice"><h3>확인할 수 있는 기록</h3><p>제출물 탭에서 제출 회차·검토 시각·저장된 피드백을, 질문 탭에서 질문과 답변 상태를 확인할 수 있습니다.</p><p className="mt8">권한 변경 사유·검토 체크 결과·알림 발송 이력은 아직 통합 기록되지 않습니다. 아래 기록을 전체 감사 로그로 간주하지 마세요.</p><AdminButton size="sm" className="mt16" onClick={() => onTabChange('submissions')}>검토 기록 보기</AdminButton></div></> : value === 'conversation' && conversationEnabled ? (tab === value ? <MemberConversation key={member.id} member={member.id}/> : null) : tab === value ? <MemberRecords key={`${member.id}-${value}`} member={member.id} email={t(member, 'email')} view={value} blockLearningEnabled={blockLearningEnabled}/> : null}</AdminTabs>
  </div>;
}

function MemberRecords({ member, email, view, blockLearningEnabled }: { member: string; email: string; view: string; blockLearningEnabled: boolean }) {
  const [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; rows: Row[]; total: number; error?: string } | null>(null);
  const key = `${member}:${view}:${page}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ member, view, page: String(page) });
    void fetch(`/api/admin/member-overview?${params}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '조회하지 못했습니다.');
      if (!controller.signal.aborted) setState({ key, rows: result.rows, total: result.total });
    }).catch(error => { if (!controller.signal.aborted) setState({ key, rows: [], total: 0, error: error.message }); });
    return () => controller.abort();
  }, [member, view, page, key]);
  const ready = state?.key === key;
  if (!ready) return <AdminLoadingState title="회원 기록을 불러오는 중입니다."/>;
  if (state.error) return <AdminInlineError onRetry={() => { document.activeElement?.closest<HTMLElement>('[role="tabpanel"]')?.focus(); setRetry(value => value + 1); }}>{state.error}</AdminInlineError>;
  const listUrl = view === 'questions' ? `/admin/questions?member=${member}` : view === 'submissions' ? `/admin/reviews?member=${member}` : '';
  return <div className="member-records">
    <div className="spread wrap-flex"><p className="meta">총 {state.total}건 · {page}페이지 · 최근 기록 순</p>{listUrl && <AdminLinkButton size="sm" href={listUrl}>회원의 {view === 'questions' ? '질문함' : '제출물'} 열기</AdminLinkButton>}</div>
    {view === 'progress' && <><AdminLearningUsage key={`usage-${member}`} member={member}/>{blockLearningEnabled && <AdminLearningProgress key={member} member={member}/>}<p className="notice mt16">아래는 실제 저장된 개별 학습 기록입니다. 기록이 없는 학습은 이 목록에 표시되지 않습니다.</p></>}
    {!state.rows.length && <AdminEmptyState title={view === 'enrollments' ? '등록된 수강권이 없습니다.' : view === 'progress' ? '저장된 개별 학습 완료 기록이 없습니다.' : '아직 저장된 기록이 없습니다.'}>다른 탭에서 수강권과 회원 상태를 확인해 주세요.</AdminEmptyState>}
    {state.rows.map(row => {
      const enrollment = view === 'enrollments' ? row : related(row, 'enrollments');
      const course = related(view === 'questions' ? row : enrollment, 'courses');
      const cohort = related(enrollment, 'cohorts');
      const lesson = related(row, 'curriculum_lessons');
      const mission = related(row, 'curriculum_missions');
      const status = view === 'enrollments' ? enrollmentLabel(row) : view === 'progress' ? `${Number(row.progress_percent)}%${row.completed_at ? ' · 완료' : ''}` : row.is_archived ? '보관' : labels[t(row, 'status')] || t(row, 'status');
      return <article className="panel pad mt16" key={row.id}>
        <p className="meta">{t(course, 'title') || '상품 미연결'}{cohort.name ? ` · ${t(cohort, 'name')}` : ''}</p>
        <h3 className="mt8">{view === 'enrollments' ? '수강권' : view === 'progress' ? `Day ${t(lesson, 'day_number')} · ${t(lesson, 'title') || '학습'}` : view === 'submissions' ? t(mission, 'title') || '미션' : t(row, 'title')}</h3>
        <AdminStatusBadge status={t(row, 'status') || 'neutral'} label={status} className="mt8"/>
        {view === 'enrollments' ? <><p className="meta mt8">이용 기간 · {row.access_starts_at ? timeLabel(row.access_starts_at) : '시작일 제한 없음'} ~ {row.access_ends_at ? timeLabel(row.access_ends_at) : '종료일 없음'}</p>{row.cohort_id && email ? <><Link className="text-link mt8" href={`/admin/members?cohort=${encodeURIComponent(t(row, 'cohort_id'))}&search=${encodeURIComponent(email)}`}>이 기수에서 회원 진행 찾기</Link><p className="meta mt8">진행 화면에는 현재 수강 가능한 회원만 표시됩니다.</p></> : <p className="meta mt8">{row.cohort_id ? '회원 이메일이 없어 진행 검색을 연결할 수 없습니다.' : '기수가 연결되지 않은 수강권입니다.'}</p>}</> : <>
          <p className="meta mt8">{view === 'submissions' ? `${t(row, 'attempt_number')}차 제출 · ` : ''}{timeLabel(row.submitted_at || row.updated_at || row.created_at)}</p>
          {view === 'submissions' && <><p className="meta mt8">검토 시각 · {row.reviewed_at ? timeLabel(row.reviewed_at) : '아직 검토되지 않음'}</p>{Boolean(row.reviewer_feedback) && <p className="reading-copy mt8">{t(row, 'reviewer_feedback')}</p>}<AdminLinkButton size="sm" className="mt16" href={`/admin/reviews?submission=${row.id}`}>제출물·피드백 보기</AdminLinkButton></>}
          {view === 'questions' && <AdminLinkButton size="sm" className="mt16" href={`/admin/questions?question=${row.id}`}>질문·답변 보기</AdminLinkButton>}
        </>}
      </article>;
    })}
    <AdminPagination page={page} pages={Math.ceil(state.total / 20)} total={state.total} pageSize={20} onChange={next => { document.activeElement?.closest<HTMLElement>('[role="tabpanel"]')?.focus(); setPage(next); }}/>
  </div>;
}
