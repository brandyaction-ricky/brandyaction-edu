'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createMutationGate } from '@/lib/mutation-gate';
import {
  EMPTY_FUNNEL_DRAFT, FUNNEL_ACQUISITION_CHANNELS, FUNNEL_MEASUREMENT_STEPS, validateFunnelDraft,
  type FunnelCourse, type FunnelCohort, type FunnelDraft,
} from '@/lib/recruitment-funnel';
import { RecruitmentRoomSettings } from './recruitment-rooms';
import { AdminButton, AdminSection, AdminSelect } from './final/admin-system';

export function RecruitmentFunnel({ courses, cohorts, canSave = false }: { courses: FunnelCourse[]; cohorts: FunnelCohort[]; canSave?: boolean }) {
  const [showRooms, setShowRooms] = useState(false);
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
      setDraft(data.draft ? { freeCourseId: data.draft.free_course_id, paidCourseId: data.draft.paid_course_id, paidCohortId: data.draft.paid_cohort_id } : EMPTY_FUNNEL_DRAFT);
      setVersion(data.draft?.version ?? 0);
      if (data.draft?.flow_version === 1) setMessage('이전 경로를 불러왔습니다. 다시 저장하면 무료 기수 없이 두 유입 경로·앵콜 흐름 기준으로 갱신됩니다.');
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
    <p><strong>AI 에이전트 마케팅 교육 → 문샷 챌린지 4기</strong></p>
    <p className="conversion-muted">첫 적용 대상의 운영 이름입니다. 기존 페이지 이름과 다를 수 있으므로 아래에서 해당 상품과 유료 교육 4기에 해당하는 기수를 확인해 선택하세요. 무료 교육에는 기수가 없습니다. 기존 기본 기수를 자동으로 4기로 바꾸지 않습니다.</p>
    <p className="conversion-muted">{canSave ? '상품과 기수를 선택한 뒤 초안을 저장하세요. 저장한 초안은 다음에 다시 불러올 수 있습니다.' : '현재 선택은 저장되지 않으며, 화면을 새로 열면 초기화됩니다. 저장에는 마케팅·상품 관리 권한이 필요합니다.'}</p>
    <div className="funnel-selection-grid">
      {(['free', 'paid'] as const).map(kind => {
        const label = kind === 'free' ? '무료' : '유료';
        const courseKey = `${kind}CourseId` as const;
        const cohortKey = 'paidCohortId' as const;
        const available = cohorts.filter(cohort => cohort.course_id === draft[courseKey]);
        return <fieldset key={kind} className="funnel-selection" disabled={pending || (canSave && version === null)}>
          <legend>{label} 교육</legend>
          <p className="conversion-muted">연결 대상: {kind === 'free' ? '무료 웨비나 · AI 에이전트 마케팅 교육' : '유료 교육 · 문샷 챌린지 4기'}</p>
          <AdminSelect label={`${label} 교육 상품`} value={draft[courseKey]} onChange={event => setDraft(current => ({ ...current, [courseKey]: event.target.value, ...(kind === 'paid' ? { paidCohortId: '' } : {}) }))}>
            <option value="">상품 선택</option>
            {courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}
          </AdminSelect>
          {kind === 'paid' && <AdminSelect label={`${label} 교육 회차·기수`} value={draft[cohortKey]} disabled={!draft[courseKey] || !available.length} onChange={event => setDraft(current => ({ ...current, [cohortKey]: event.target.value }))}>
            <option value="">회차·기수 선택</option>
            {available.map(cohort => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}
          </AdminSelect>}
          {kind === 'free' && <p className="conversion-muted">무료 교육은 상품만 연결합니다. 신청과 첫 라이브·앵콜 참여를 별도로 확인합니다.</p>}
          {kind === 'paid' && draft[courseKey] && !available.length && <p className="conversion-muted">불러온 목록에 회차·기수가 없습니다. 등록 여부와 목록 범위를 확인해야 합니다.</p>}
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
    {canSave && <>
      <AdminButton aria-expanded={showRooms} onClick={() => setShowRooms(value => !value)}>{showRooms ? '카톡방 설정 닫기' : '모집별 카톡방 관리'}</AdminButton>
      {showRooms && <RecruitmentRoomSettings />}
    </>}
    <div className="funnel-selection-grid" aria-label="모집 유입 경로">
      {FUNNEL_ACQUISITION_CHANNELS.map(channel => <div key={channel.id}><strong>{channel.label}</strong><p>{channel.evidence} → {channel.room} → 무료 웨비나 (YouTube Live) → 문샷 챌린지 4기</p></div>)}
    </div>
    <p className="conversion-muted">광고와 오가닉은 각각 전용 오픈채팅방으로 유입된 뒤 같은 후속 CRM·앵콜 흐름으로 이어집니다. 방 주소는 모집별 카톡방 관리에서 별도로 저장합니다. 첫·앵콜 라이브 주소와 실제 고객 동선은 연결 확인 전입니다. 2차 전환은 동일 4기 추가 모집 기준입니다. 유입 출처와 1·2차 전환을 별도로 구분하며, 과거 외부 사이트 교육 이력은 이번 모집에 합산하지 않습니다.</p>
    <ol className="funnel-measurement-grid" aria-label="모집 단계별 측정 준비">
      {FUNNEL_MEASUREMENT_STEPS.map(step => <li key={step.id}>
        <strong>{step.label}</strong><span className="conversion-tag">연결 확인 전</span><p>{step.evidence}</p>
      </li>)}
    </ol>
    <p className="conversion-muted">실적은 아직 집계하지 않습니다. 신청과 참여를 구분하고, 연결되지 않은 단계는 0명으로 표시하지 않습니다. 기존 수집 기능의 존재만으로 이 경로의 측정 완료를 판단하지 않습니다.</p>
  </AdminSection>;
}
