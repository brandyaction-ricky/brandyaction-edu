'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createMutationGate } from '@/lib/mutation-gate';
import {
  EMPTY_FUNNEL_DRAFT, FUNNEL_MEASUREMENT_STEPS, validateFunnelDraft,
  type FunnelCourse, type FunnelCohort, type FunnelDraft,
} from '@/lib/recruitment-funnel';
import { AdminButton, AdminSection, AdminSelect } from './final/admin-system';

export function RecruitmentFunnel({ courses, cohorts, canSave = false }: { courses: FunnelCourse[]; cohorts: FunnelCohort[]; canSave?: boolean }) {
  const [draft, setDraft] = useState<FunnelDraft>(EMPTY_FUNNEL_DRAFT);
  const [version, setVersion] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const gate = useRef(createMutationGate<Record<string, unknown>>());
  const active = useRef(true);
  const read = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    read.current?.abort();
    const controller = new AbortController(); read.current = controller;
    setPending(true); setVersion(null); setMessage('');
    try {
      const response = await fetch('/api/conversion/funnel', { cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '모집 경로를 불러오지 못했습니다.');
      if (!active.current || controller.signal.aborted) return;
      setDraft(data.draft ? { freeCourseId: data.draft.free_course_id, freeCohortId: data.draft.free_cohort_id, paidCourseId: data.draft.paid_course_id, paidCohortId: data.draft.paid_cohort_id } : EMPTY_FUNNEL_DRAFT);
      setVersion(data.draft?.version ?? 0);
    } catch (error) {
      if (active.current && !controller.signal.aborted) { setDraft(EMPTY_FUNNEL_DRAFT); setMessage((error as Error).message); }
    } finally { if (active.current && !controller.signal.aborted) setPending(false); }
  }, []);
  useEffect(() => {
    active.current = true;
    const timer = canSave ? setTimeout(() => void reload(), 0) : undefined;
    return () => { active.current = false; clearTimeout(timer); read.current?.abort(); };
  }, [canSave, reload]);
  const save = async () => {
    setPending(true); setMessage('');
    try {
      const result = await gate.current({ ...draft, expected_version: version }, async body => {
        const response = await fetch('/api/conversion/funnel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await response.json();
        if (!response.ok) throw Object.assign(new Error(data.error || '저장하지 못했습니다.'), { status: response.status });
        return data;
      });
      if (!active.current) return;
      setVersion((result.draft as { version: number }).version);
      setMessage('모집 경로 초안을 저장했습니다. 측정·실험은 시작되지 않았습니다.');
    } catch (error) {
      if (!active.current) return;
      if ([401,403,409].includes((error as Error & { status?: number }).status || 0)) { setVersion(null); setDraft(EMPTY_FUNNEL_DRAFT); }
      setMessage((error as Error).message);
    } finally { if (active.current) setPending(false); }
  };
  const validation = validateFunnelDraft(draft, courses, cohorts);
  return <AdminSection title="무료 교육 → 유료 교육" description="첫 모집 경로 준비" bordered>
    <p><strong>AI 에이전트 마케팅 교육 → 문샷 챌린지 O기</strong></p>
    <p className="conversion-muted">첫 적용 대상의 운영 이름입니다. 기존 페이지 이름과 다를 수 있으므로 아래에서 해당 상품과 실제 회차·기수를 확인해 선택하세요. O기는 실제 기수로 확정해야 합니다.</p>
    <p className="conversion-muted">{canSave ? '상품과 기수를 선택한 뒤 초안을 저장하세요. 저장한 초안은 다음에 다시 불러올 수 있습니다.' : '현재 선택은 저장되지 않으며, 화면을 새로 열면 초기화됩니다. 저장에는 마케팅·상품 관리 권한이 필요합니다.'}</p>
    <div className="funnel-selection-grid">
      {(['free', 'paid'] as const).map(kind => {
        const label = kind === 'free' ? '무료' : '유료';
        const courseKey = `${kind}CourseId` as const;
        const cohortKey = `${kind}CohortId` as const;
        const available = cohorts.filter(cohort => cohort.course_id === draft[courseKey]);
        return <fieldset key={kind} className="funnel-selection" disabled={pending || (canSave && version === null)}>
          <legend>{label} 교육</legend>
          <p className="conversion-muted">연결 대상: {kind === 'free' ? '무료 웨비나 · AI 에이전트 마케팅 교육' : '유료 교육 · 문샷 챌린지 O기'}</p>
          <AdminSelect label={`${label} 교육 상품`} value={draft[courseKey]} onChange={event => setDraft(current => ({ ...current, [courseKey]: event.target.value, [cohortKey]: '' }))}>
            <option value="">상품 선택</option>
            {courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}
          </AdminSelect>
          <AdminSelect label={`${label} 교육 회차·기수`} value={draft[cohortKey]} disabled={!draft[courseKey] || !available.length} onChange={event => setDraft(current => ({ ...current, [cohortKey]: event.target.value }))}>
            <option value="">회차·기수 선택</option>
            {available.map(cohort => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}
          </AdminSelect>
          {draft[courseKey] && !available.length && <p className="conversion-muted">불러온 목록에 회차·기수가 없습니다. 등록 여부와 목록 범위를 확인해야 합니다.</p>}
        </fieldset>;
      })}
    </div>
    {canSave && <div className="funnel-entry">
      <AdminButton disabled={pending || version === null || !validation.valid} onClick={() => void save()}>모집 경로 초안 저장</AdminButton>
      <AdminButton disabled={pending} onClick={() => void reload()}>저장된 경로 다시 불러오기</AdminButton>
      {version !== null && <span className="conversion-muted">{version ? `저장 버전 ${version}` : '아직 저장된 경로 없음'}</span>}
    </div>}
    {message && <p role="status" className="conversion-notice">{message}</p>}
    <div role="status" className="funnel-readiness">
      {validation.valid ? <p>상품·기수 선택 완료 · 무료/유료 판매 조건과 실제 측정 연결은 확인 전입니다.</p> : <ul>{validation.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
    </div>
    <ol className="funnel-measurement-grid" aria-label="모집 단계별 측정 준비">
      {FUNNEL_MEASUREMENT_STEPS.map(step => <li key={step.id}>
        <strong>{step.label}</strong><span className="conversion-tag">연결 확인 전</span><p>{step.evidence}</p>
      </li>)}
    </ol>
    <p className="conversion-muted">실적은 아직 집계하지 않습니다. 신청과 참여를 구분하고, 연결되지 않은 단계는 0명으로 표시하지 않습니다. 기존 수집 기능의 존재만으로 이 경로의 측정 완료를 판단하지 않습니다.</p>
  </AdminSection>;
}
