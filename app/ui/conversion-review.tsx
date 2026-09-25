'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { ConversionCase, ConversionEvidence, ConversionJevV4Run, ConversionOrderCandidate, ConversionSnapshot } from '@/lib/conversion-review';
import { buildAsidePaymentMatchPrompt, isRunStale } from '@/lib/conversion-review';
import type { JevV4DecisionKey } from '@/lib/conversion-jev-v4';
import { createMutationGate } from '@/lib/mutation-gate';
import { safeUrl } from '@/lib/platform';
import {
  AdminButton, AdminDrawer, AdminEmptyState, AdminInput, AdminPage,
  AdminPageHeader, AdminSearchField, AdminSection, AdminSelect, AdminTextarea,
} from '@/features/admin-ui';
import './conversion-review.css';
import { RecruitmentRoomSettings } from './recruitment-rooms';
import { RecruitmentFunnel } from './recruitment-funnel';
import { ConversionJevV4Synthetic } from './conversion-jev-v4-synthetic';

const topicNames: Record<string, string> = { price: '가격', schedule: '일정', content: '교육 내용', level: '수강 수준', usage: '이용 방법' };
const inquiryNames: Record<string, string> = { prepurchase: '구매 전 상품 질문', support: '이용 지원', payment_refund: '결제·환불', mixed: '여러 종류의 문의', unknown: '판단 불가' };
const decisionNames: Record<string, string> = { accept: '직원 승인', edit: '수정 후 승인', hold: '보류', reject: '사용 안 함' };
const jevNames: Record<string, string> = {
  high: '높음', medium: '중간', low: '낮음', unclear: '판단 보류',
  price: '가격', schedule: '일정', skill_level: '수강 수준', content_fit: '내용 적합성', trust: '신뢰', none_or_unknown: '불명확',
  answer_specific_questions: '질문에 구체적으로 답변', invite_webinar: '무료 웨비나 안내', offer_purchase_info: '구매 절차 안내', human_consult: '운영자 상담', hold_no_contact: '추가 접촉 보류',
};
const confidence = (value: number) => `${Math.round(value * 100)}%`;
const jevV4Labels: Record<JevV4DecisionKey, string> = {
  information_need: '문의에서 직접 요청한 내용', confirmed_barrier: '직접 밝힌 어려움',
  attempted_action_target: '실제로 하려 한 일', operational_issue: '겪은 이용 문제',
  paid_program_reference: '유료 교육 언급', observable_stage: '유료 구매 행동',
};
const jevV4Choices: Record<string, string> = {
  price_or_payment: '가격·결제 질문', schedule_or_deadline: '일정·마감 질문', curriculum_or_fit: '내용·적합성 질문',
  skill_requirement: '필요 역량 질문', registration_or_access: '신청·접근 질문', other_or_unclear: '그 밖의 질문·불명확',
  explicit_price_burden: '비용 부담을 직접 밝힘', explicit_schedule_conflict: '일정 충돌을 직접 밝힘',
  explicit_skill_concern: '역량 우려를 직접 밝힘', explicit_content_mismatch: '내용 불일치를 직접 밝힘',
  explicit_trust_concern: '신뢰 우려를 직접 밝힘', none_stated: '직접 밝힌 어려움 없음', unclear: '판단 보류',
  free_live_or_replay: '무료 방송·다시보기 접근', paid_application: '유료 신청', paid_payment: '유료 결제',
  other_nonpurchase_action: '그 밖의 행동', no_attempt_stated: '시도 언급 없음',
  free_content_access_failure: '무료 콘텐츠 접근 실패', paid_application_failure: '유료 신청 실패',
  paid_payment_failure: '유료 결제 실패', other_access_failure: '그 밖의 접근 실패',
  future_consideration_after_free_content: '무료 콘텐츠를 본 뒤 유료 교육 검토',
  paid_program_question: '유료 교육 조건 질문', purchase_decision: '유료 신청·구매 결정', paid_application_or_payment: '유료 신청·결제 시도 명시',
  no_paid_reference: '유료 교육 언급 없음', no_purchase_signal: '유료 구매 신호 언급 없음',
  information_seeking: '유료 정보 탐색', specific_evaluation: '구체 조건 검토',
  conditional_purchase_statement: '조건부 신청·구매 의사', paid_application_or_payment_attempt: '유료 신청·결제 시도 명시',
};
const jevV4UncertaintyLabels: Record<string, string> = {
  unclear_choice: 'Jev가 답을 고르지 못함', unresolved_category: '정보가 부족해 답을 구분하기 어려움',
  low_reported_confidence: 'Jev가 확신을 낮게 표시함', narrow_probability_margin: '가능한 답들이 비슷함',
  choice_not_top_probability: 'Jev가 고른 답과 가장 가능성 높게 본 답이 다름',
};
const displayTime = (value: string) => new Date(value).toLocaleString('ko-KR');
type Mutation = (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;

async function readResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || '요청을 처리하지 못했습니다.'), { status: response.status });
  return data;
}

const conversionSnapshots = new Map<
  string,
  { expiresAt: number; promise: Promise<ConversionSnapshot> }
>();

function readConversionSnapshot(userId: string, force = false) {
  const cached = conversionSnapshots.get(userId);
  if (!force && cached && (!cached.expiresAt || cached.expiresAt > Date.now()))
    return cached.promise;
  if (cached) conversionSnapshots.delete(userId);

  const entry = {
    expiresAt: 0,
    promise: fetch('/api/conversion', {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    }).then(readResponse) as Promise<ConversionSnapshot>,
  };
  conversionSnapshots.set(userId, entry);
  void entry.promise.then(
    () => {
      if (conversionSnapshots.get(userId) === entry)
        entry.expiresAt = Date.now() + 5000;
    },
    () => {
      if (conversionSnapshots.get(userId) === entry)
        conversionSnapshots.delete(userId);
    },
  );
  return entry.promise;
}

export function prefetchConversionReview(userId: string) {
  void readConversionSnapshot(userId).catch(() => {});
}

export function ConversionReview({ workspace = false, initialPeriod, userId }: { workspace?: boolean; initialPeriod?: string; userId: string }) {
  const [workspaceView, setWorkspaceView] = useState<'recruitment' | 'inquiries'>('recruitment');
  const [snapshot, setSnapshot] = useState<ConversionSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [v4Pending, setV4Pending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drawer, setDrawer] = useState<'case' | 'evidence' | null>(null);
  const [caseSource, setCaseSource] = useState<'native' | 'manual'>('native');
  const [showFunnel, setShowFunnel] = useState(false);
  const [editingCase, setEditingCase] = useState<ConversionCase | undefined>();
  const [editingEvidence, setEditingEvidence] = useState<ConversionEvidence | undefined>();
  const gate = useRef(createMutationGate<Record<string, unknown>>());
  const active = useRef(true);
  const read = useRef<AbortController | null>(null);

  const refresh = useCallback(async (allowPrefetched = false) => {
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    setLoading(true);
    try {
      const data = await readConversionSnapshot(userId, !allowPrefetched);
      if (!active.current || controller.signal.aborted) return;
      setSnapshot(data);
      setError('');
    } catch (cause) {
      if (!active.current || controller.signal.aborted) return;
      // Discard old customer data when the current access cannot be verified.
      setSnapshot(null);
      setError((cause as Error).message);
    } finally {
      if (active.current && !controller.signal.aborted) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    active.current = true;
    const timer = setTimeout(() => void refresh(true), 0);
    return () => { active.current = false; clearTimeout(timer); read.current?.abort(); };
  }, [refresh]);

  const mutate: Mutation = async (payload) => {
    setPending(true); setError(''); setNotice('');
    try {
      const result = await gate.current(payload, async body => readResponse(await fetch('/api/conversion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })));
      await refresh();
      const notices: Record<string, string> = {
        save_case: '문의 정보를 저장했습니다.',
        save_evidence: '설명자료를 저장했습니다.',
        analyze: snapshot?.capabilities.analyze_provider === 'jev' ? 'Jev가 문의를 읽고 분류했습니다. 직원이 답변 초안을 확인해 주세요.' : '모의 결과를 만들었습니다. 설명을 확인한 뒤 검토 결정을 남겨 주세요.',
        review: payload.decision === 'hold' ? '직원이 보류로 기록했습니다. 고객에게 메시지를 보내지 않았습니다.'
          : payload.decision === 'reject' ? '직원이 이 답변을 사용하지 않기로 했습니다. 고객에게 메시지를 보내지 않았습니다.'
            : '직원이 답변 초안을 승인해 기록했습니다. 고객에게 자동으로 보내지 않았습니다.',
        manage_case: payload.operation === 'purchase_outcome' ? '결제 여부를 기록했습니다. 사이트 주문을 자동으로 확인한 것은 아닙니다.'
          : payload.operation === 'archive' ? '문의 목록에서 삭제했습니다. 삭제한 문의 보기에서 복구할 수 있습니다.' : '문의를 복구했습니다.',
        manage_case_order: payload.operation === 'link' ? '직원이 확인한 주문 기록을 문의에 연결했습니다.' : '주문 기록 연결을 해제했습니다.',
      };
      setNotice(notices[String(payload.action)] || '저장했습니다.');
      return result;
    } catch (cause) {
      const failure = cause as Error & { status?: number };
      if ([401, 403].includes(failure.status || 0)) { setSnapshot(null); setDrawer(null); }
      if (failure.status === 409) await refresh();
      setError(failure.message);
      throw cause;
    } finally { setPending(false); }
  };

  async function runJevV4(runId: string) {
    const response = await fetch('/api/conversion/jev-v4', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v1_run_id: runId }),
    });
    await readResponse(response);
  }

  async function runJevV4ForReview(runId: string) {
    if (v4Pending || pending) return;
    setV4Pending(true); setError(''); setNotice('');
    try {
      await runJevV4(runId);
      await refresh();
      setNotice('Jev가 문의를 나눠 살펴봤습니다. 직원 확인용 결과로 저장했으며 고객에게 보내지 않았습니다.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally { setV4Pending(false); }
  }

  const selected = snapshot?.cases.find(item => item.id === selectedId);
  const canAnalyze = snapshot ? (snapshot.capabilities.can_analyze ?? snapshot.capabilities.can_mock) : false;
  const cases = snapshot?.cases.filter(item => Boolean(item.archived_at) === showArchived && (item.subject + ' ' + item.content).toLowerCase().includes(query.toLowerCase())) || [];
  const run = snapshot?.runs.filter(item => item.case_id === selected?.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const stale = Boolean(run && selected && snapshot && isRunStale(run, selected, snapshot.evidence));
  const records = snapshot?.reviews.filter(item => item.case_id === selected?.id).sort((a, b) => b.created_at.localeCompare(a.created_at)) || [];
  const jevV4Run = run && snapshot ? snapshot.jev_v4_runs?.find(item => item.v1_run_id === run.id) : undefined;
  const openCase = (item?: ConversionCase, initialSource: 'native' | 'manual' = 'native') => { setEditingCase(item); setDrawer('case'); setCaseSource(initialSource); };
  const openEvidence = (item?: ConversionEvidence) => { setEditingEvidence(item); setDrawer('evidence'); };

  return <AdminPage width="wide" template="review" className="conversion-review">
    <AdminPageHeader title={workspace ? "모집 운영" : "전환 관리"} description={workspace ? "모집별 연결·구매 현황·후속 안내를 한곳에서 관리합니다." : "문의에 필요한 설명을 찾고, 검토한 내용을 기록합니다."} eyebrow="MARKETING" actions={<>
      <AdminButton disabled={pending || loading} onClick={() => void refresh()}>새로고침</AdminButton>
      {snapshot && (!workspace || workspaceView === 'inquiries') && <>
        <AdminButton disabled={pending} onClick={() => openCase(undefined, 'native')}>사이트 문의 연결</AdminButton>
        <AdminButton tone="primary" disabled={pending} onClick={() => openCase(undefined, 'manual')}>카톡 문의 붙여넣기</AdminButton>
      </>}
    </>} />
    {error && <div role="alert" className="conversion-alert">{error}</div>}
    {notice && <p role="status" className="conversion-notice">{notice}</p>}
    {loading && !snapshot && <p role="status">문의와 검토 기록을 불러오고 있습니다.</p>}
    {!loading && !snapshot && <AdminEmptyState title="전환 관리 정보를 불러오지 못했습니다." action={<AdminButton onClick={() => void refresh()}>다시 불러오기</AdminButton>}>접근 권한과 기능 사용 가능 여부를 확인해 주세요.</AdminEmptyState>}
    {snapshot && <>
      {workspace ? <>
        <div className="funnel-entry" aria-label="모집 운영 작업">
          <AdminButton aria-pressed={workspaceView === 'recruitment'} onClick={() => setWorkspaceView('recruitment')}>모집 설정·구매·후속 안내</AdminButton>
          <AdminButton aria-pressed={workspaceView === 'inquiries'} onClick={() => setWorkspaceView('inquiries')}>구매 전 문의 검토</AdminButton>
        </div>
        <div hidden={workspaceView !== 'recruitment'}>
          <p className="conversion-muted">모집 코드를 불러오면 카톡방 → 무료 신청·유료 기수 → 구매 현황 → 방송·후속 안내 순서로 확인합니다. 상품 연결은 아래 실제 모집 설정에서 한 번만 관리합니다.</p>
          {snapshot.capabilities.can_manage_funnel ? <RecruitmentRoomSettings initialPeriod={initialPeriod} courses={snapshot.courses} cohorts={snapshot.cohorts} expanded /> : <p>모집 설정에는 마케팅·상품 관리 권한이 필요합니다.</p>}
        </div>
      </> : <>      <div className="funnel-entry"><AdminButton aria-expanded={showFunnel} aria-controls="recruitment-funnel-preparation" onClick={() => setShowFunnel(value => !value)}>{showFunnel ? '모집 경로 준비 닫기' : '모집 경로 준비'}</AdminButton><span className="conversion-muted">무료 교육부터 유료 구매까지 연결할 경로를 확인합니다.</span></div>
      {showFunnel && <div id="recruitment-funnel-preparation"><RecruitmentFunnel key={String(snapshot.capabilities.can_manage_funnel)} courses={snapshot.courses} cohorts={snapshot.cohorts} canSave={snapshot.capabilities.can_manage_funnel === true} /></div>}
</>}
      <div hidden={workspace && workspaceView !== 'inquiries'}>
      <div className="conversion-intro"><span className="conversion-tag">직원 확인 필요</span><p>Jev가 문의를 분류하고 답변 초안을 제안합니다. 직원이 승인·수정·보류를 선택해야 합니다. 여기서 승인해도 고객에게 메시지가 자동으로 나가지는 않습니다.</p></div>
      {snapshot.capabilities.can_jev_v4 && <ConversionJevV4Synthetic />}
      {snapshot.capabilities.can_jev && <p className="conversion-muted">사람이 먼저 별도 점수를 매기지 않아도 Jev 결과를 볼 수 있습니다. 직원의 결정은 고객 응대에 쓰기 전 마지막 확인으로 기록합니다.</p>}
      <div className="conversion-grid" aria-busy={pending || loading}>
        <AdminSection title="문의" description={`현재 목록 ${cases.length}건`} bordered>
          <AdminSearchField label="문의 검색" value={query} onChange={event => setQuery(event.target.value)} />
          <AdminButton disabled={pending} aria-pressed={showArchived} onClick={() => { setShowArchived(value => !value); setSelectedId(''); }}>{showArchived ? '진행 중인 문의 보기' : `삭제한 문의 보기${snapshot.cases.filter(item => item.archived_at).length ? ` (${snapshot.cases.filter(item => item.archived_at).length})` : ''}`}</AdminButton>
          <div className="conversion-case-list">
            {cases.map(item => <button type="button" key={item.id} className={'conversion-case' + (selectedId === item.id ? ' is-selected' : '')} disabled={pending} aria-pressed={selectedId === item.id} onClick={() => { setSelectedId(item.id); setNotice(''); }}>
              <span>{item.sample_origin === 'external_legacy' ? '과거 교육 상담' : item.source_type === 'native' ? '사이트 문의' : '외부 문의'}</span><strong>{item.subject}</strong>
              <small>{item.legacy_course_label || snapshot.courses.find(course => course.id === item.course_id)?.title || '연결 상품'}</small>
              <small>{item.archived_at ? '삭제한 문의 · 복구 가능' : item.purchase_outcome === 'paid' ? '결제 확인' : item.purchase_outcome === 'not_paid' ? '결제 안 함 확인' : '결제 여부 미확인'}</small>
              <small>{displayTime(item.received_at)}</small>
            </button>)}
            {!cases.length && <AdminEmptyState compact title={query ? '검색 결과가 없습니다.' : showArchived ? '복구할 문의가 없습니다.' : '아직 연결한 문의가 없습니다.'}>문의 연결에서 검토할 문의를 선택하세요.</AdminEmptyState>}
          </div>
        </AdminSection>
        <div className="conversion-main">
          {!selected ? <AdminEmptyState title="검토할 문의를 선택하세요.">문의와 상품을 연결하면 설명자료를 함께 검토할 수 있습니다.</AdminEmptyState> : <>
            <AdminSection title={selected.subject} bordered actions={<>
              {!selected.archived_at && <AdminButton disabled={pending} onClick={() => openCase(selected)}>문의 정보 수정</AdminButton>}
              {!selected.archived_at
                ? <AdminButton disabled={pending || snapshot.capabilities.can_manage_cases === false} onClick={async () => {
                  if (!window.confirm('이 문의를 목록에서 삭제할까요? 삭제한 문의 보기에서 다시 복구할 수 있습니다.')) return;
                  try { await mutate({ action: 'manage_case', operation: 'archive', case_id: selected.id, expected_version: selected.input_version }); setShowArchived(true); }
                  catch { /* the shared mutation handler shows the error */ }
                }}>목록에서 삭제</AdminButton>
                : <AdminButton disabled={pending || snapshot.capabilities.can_manage_cases === false} onClick={async () => {
                  try { await mutate({ action: 'manage_case', operation: 'restore', case_id: selected.id, expected_version: selected.input_version }); setShowArchived(false); }
                  catch { /* the shared mutation handler shows the error */ }
                }}>문의 복구</AdminButton>}
            </>}>
              {selected.archived_at && <p className="conversion-alert">목록에서 삭제된 문의입니다. 다시 되돌릴 수 있습니다.</p>}
              <dl className="conversion-meta"><dt>문의 시기</dt><dd>{selected.sample_origin === 'external_legacy' ? '과거 유료 교육 상담 · 이번 모집 성과에서 제외' : '현재 교육 문의'}</dd><dt>상품</dt><dd>{selected.legacy_course_label || snapshot.courses.find(course => course.id === selected.course_id)?.title || '상품 미확인'}</dd><dt>기수</dt><dd>{snapshot.cohorts.find(cohort => cohort.id === selected.cohort_id)?.name || '미지정'}</dd><dt>회원 연결</dt><dd>{selected.customer_id ? '사이트 회원 정보가 연결됨' : '회원 정보가 연결되지 않아 이후 구매 여부를 알 수 없음'}</dd><dt>문의 출처</dt><dd>{selected.source_label}</dd></dl>
              {selected.sample_origin === 'external_legacy' && <p className="conversion-muted">과거 상품에 대한 문의입니다. 새 성능 점수 계산에는 사용하지 않습니다. 당시 상품 자료가 연결되지 않았다면 현재 상품 설명이나 구매 링크를 답변 근거로 사용하지 마세요.</p>}
              <p className="conversion-quote">{selected.content}</p>
              {selected.question_id && <Link href="/admin/questions" className="conversion-link">기존 질문함 열기</Link>}
            </AdminSection>
            <PurchaseOutcomeForm key={`${selected.id}:${selected.purchase_outcome || 'unknown'}:${selected.purchase_checked_at || ''}`} item={selected} pending={pending} enabled={snapshot.capabilities.can_manage_cases !== false} mutate={mutate} />
            {selected.source_type === 'manual' && selected.sample_origin === 'current' && <AsidePaymentMatchPrompt
              key={selected.id}
              item={selected}
              courseName={selected.legacy_course_label || snapshot.courses.find(course => course.id === selected.course_id)?.title || ''}
              cohortName={snapshot.cohorts.find(cohort => cohort.id === selected.cohort_id)?.name || ''}
              enabled={snapshot.capabilities.can_copy_aside_match === true && !selected.archived_at}
            />}
            {selected.source_type === 'manual' && selected.sample_origin === 'current' && <CaseOrderLinkPanel item={selected} enabled={snapshot.capabilities.can_copy_aside_match === true && !selected.archived_at} pending={pending} mutate={mutate} />}
            <AdminSection title="Jev 문의 분류와 답변 초안" bordered actions={<AdminButton tone="primary" disabled={pending || !canAnalyze || Boolean(selected.archived_at)} onClick={() => void mutate({ action: 'analyze', case_id: selected.id, expected_version: selected.input_version }).catch(() => {})}>{pending ? '처리 중' : snapshot.capabilities.analyze_provider === 'jev' ? 'Jev 결과 보기' : '모의 결과 보기'}</AdminButton>}>
              {!canAnalyze && <p className="conversion-muted">현재 환경에서는 판정을 실행할 수 없습니다. 설명자료는 직접 검토할 수 있습니다.</p>}
              {run ? <div className="conversion-result">
                <span className="conversion-tag">{run.provider === 'jev' ? 'Jev 결과 · 직원 확인 필요' : '모의 결과 · 직원 확인 필요'}</span>
                {stale && <p role="alert" className="conversion-alert">문의나 설명자료가 바뀌었습니다. 새로 판단한 뒤 검토 기록을 남겨 주세요.</p>}
                <p>{run.result.notice}</p>
                {run.result.mode === 'jev' && <><div className="conversion-jev-grid" aria-label="Jev 전환 판정">
                  <div><span>구매 의도</span><strong>{jevNames[run.result.decisions.purchase_intent.choice]}</strong><small>Jev가 표시한 확신 {confidence(run.result.decisions.purchase_intent.confidence)}</small></div>
                  <div><span>주요 장애물</span><strong>{jevNames[run.result.decisions.primary_barrier.choice]}</strong><small>Jev가 표시한 확신 {confidence(run.result.decisions.primary_barrier.confidence)}</small></div>
                  <div><span>구매 준비도</span><strong>{run.result.decisions.purchase_readiness.score.toFixed(1)} / 4</strong><small>Jev가 표시한 확신 {confidence(run.result.decisions.purchase_readiness.confidence)}</small></div>
                  <div><span>권장 다음 행동</span><strong>{jevNames[run.result.decisions.next_action.choice]}</strong><small>Jev가 표시한 확신 {confidence(run.result.decisions.next_action.confidence)}</small></div>
                </div><p className="conversion-muted">이 확신은 Jev가 스스로 표시한 값입니다. 실제로 맞을 확률이나 정확도를 뜻하지 않습니다. 낮은 값이나 ‘다시 볼 부분’이 있으면 문의 내용을 함께 읽어 주세요.</p></>}
                <p><strong>문의 구분</strong> · {inquiryNames[run.result.inquiry_type]}</p>
                <div className="conversion-topics">{run.result.topics.filter(topic => topic.status === 'explicit').map(topic => <span key={topic.topic} className="conversion-tag">{topicNames[topic.topic]}</span>)}</div>
                {run.result.missing_topics.length > 0 && <p className="conversion-alert">추가 확인 필요: {run.result.missing_topics.map(topic => topicNames[topic]).join(', ')}</p>}
                {run.result.candidates.filter(candidate => candidate.fit !== 'irrelevant').map(candidate => {
                  const evidence = run.evidence_snapshot?.find(item => item.id === candidate.evidence_id) || snapshot.evidence.find(item => item.id === candidate.evidence_id);
                  return <div key={candidate.evidence_id} className="conversion-evidence"><strong>{evidence?.title || '자료 확인 필요'}</strong><p>{candidate.reason}</p>{evidence && evidence.version === candidate.evidence_version ? <p className="conversion-quote">{evidence.body}</p> : <p className="conversion-muted">판단 이후 자료가 변경됐습니다. 당시 조합한 설명은 아래 검토 내용에 보존됩니다.</p>}</div>;
                })}
                {run.provider === 'jev' && snapshot.capabilities.can_jev_v4 && <JevV4ReviewPanel
                  run={jevV4Run}
                  disabled={pending || v4Pending || stale || Boolean(selected.archived_at)}
                  onRun={() => void runJevV4ForReview(run.id)}
                />}
                <ReviewForm key={run.id} runId={run.id} caseId={selected.id} initialReply={run.result.proposed_reply} stale={stale || Boolean(selected.archived_at)} pending={pending} mutate={mutate} />
              </div> : <AdminEmptyState compact title="아직 판단 기록이 없습니다.">아래 설명자료를 확인한 뒤 판정을 실행하세요.</AdminEmptyState>}
            </AdminSection>
            <AdminSection title="상품 설명자료" description="승인된 자료만 추천 후보에 포함됩니다." bordered actions={snapshot.capabilities.can_manage_evidence && <AdminButton disabled={pending} onClick={() => openEvidence()}>자료 등록</AdminButton>}>
              {snapshot.evidence.filter(item => item.course_id === selected.course_id && (!item.cohort_id || item.cohort_id === selected.cohort_id)).map(item => <article className="conversion-evidence" key={item.id}>
                <div className="conversion-evidence-heading"><strong>{item.title}</strong><span className="conversion-tag">{item.status === 'approved' ? '승인' : item.status === 'retired' ? '철회' : '초안'} · v{item.version}</span></div>
                <p className="conversion-quote">{item.body}</p>
                {safeUrl(item.source_url) && <a href={safeUrl(item.source_url)} target="_blank" rel="noopener noreferrer" className="conversion-link">근거 원문 열기</a>}
                {snapshot.capabilities.can_manage_evidence && <AdminButton disabled={pending} onClick={() => openEvidence(item)}>자료 수정</AdminButton>}
              </article>)}
              {!snapshot.evidence.some(item => item.course_id === selected.course_id && (!item.cohort_id || item.cohort_id === selected.cohort_id)) && <AdminEmptyState compact title="연결된 설명자료가 없습니다.">상품 관리 권한이 있는 운영자가 출처와 설명을 등록할 수 있습니다.</AdminEmptyState>}
            </AdminSection>
          </>}
        </div>
        <AdminSection title="직원 확인 기록" bordered>
          <p className="conversion-muted">직원 승인 여부를 남깁니다. 이 화면에서 승인해도 고객에게 메시지는 보내지지 않습니다.</p>
          {records.map(record => <article className="conversion-record" key={record.id}><strong>{decisionNames[record.decision]}</strong><small>{displayTime(record.created_at)}</small>{record.reply_text && <p className="conversion-quote">{record.reply_text}</p>}{record.reason && <p>사유: {record.reason}</p>}<span className="conversion-tag">{['accept', 'edit'].includes(record.decision) ? '승인된 답변 초안 · 미발송' : '직원 검토 기록 · 미발송'}</span></article>)}
          {!records.length && <AdminEmptyState compact title="아직 검토 기록이 없습니다." />}
          <div className="conversion-next"><strong>구매·환불 결과</strong><p>주문 연결은 준비 중입니다. 현재 화면의 기록으로 구매 성과를 계산하지 않습니다.</p></div>
        </AdminSection>
      </div>
      </div>
      {drawer === 'case' && <AdminDrawer title={editingCase ? '문의 정보 수정' : caseSource === 'manual' ? '카톡 문의 붙여넣기' : '사이트 문의 연결'} onClose={() => { if (!pending) setDrawer(null); }}>
        <CaseForm key={editingCase?.id || `new-${caseSource}`} snapshot={snapshot} item={editingCase} initialSource={caseSource} pending={pending || v4Pending} mutate={mutate} runJevV4={async runId => { setV4Pending(true); try { await runJevV4(runId); await refresh(); } finally { setV4Pending(false); } }} onSaved={(id, note) => { setSelectedId(id); setDrawer(null); if (note) setNotice(note); }} />
      </AdminDrawer>}
      {drawer === 'evidence' && <AdminDrawer title={editingEvidence ? '설명자료 수정' : '설명자료 등록'} onClose={() => { if (!pending) setDrawer(null); }}>
        <EvidenceForm key={editingEvidence?.id || 'new'} snapshot={snapshot} item={editingEvidence} initialCourse={selected?.course_id || ''} pending={pending} mutate={mutate} onSaved={() => setDrawer(null)} />
      </AdminDrawer>}
    </>}
  </AdminPage>;
}

const orderStatusLabels: Record<string, string> = { paid: '결제 완료', partially_refunded: '일부 환불', refunded: '전액 환불' };
function CaseOrderLinkPanel({ item, enabled, pending, mutate }: { item: ConversionCase; enabled: boolean; pending: boolean; mutate: Mutation }) {
  const [orders, setOrders] = useState<ConversionOrderCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void fetch(`/api/conversion/orders?case_id=${encodeURIComponent(item.id)}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
      .then(readResponse).then(data => {
        if (!active) return;
        setOrders(data.orders || []);
        if (data.message) setError(data.message);
      }).catch(cause => { if (active) setError((cause as Error).message || '주문 기록을 불러오지 못했습니다.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [item.id, revision]);
  const linked = orders.filter(order => order.linked_at);
  const candidates = orders.filter(order => !order.linked_at);
  async function link(order: ConversionOrderCandidate, operation: 'link' | 'unlink') {
    if (pending) return;
    setError('');
    setError('');
    try {
      await mutate({ action: 'manage_case_order', operation, case_id: item.id, expected_version: item.input_version, order_id: order.id });
      setLoading(true); setRevision(value => value + 1);
    } catch (cause) { setError((cause as Error).message); }
  }
  return <AdminSection title="실제 결제 기록 확인" bordered>
    <p className="conversion-muted">같은 상품·기수의 결제 기록을 문의 뒤 90일 동안 찾아 보여줍니다. 목록에 있다는 사실만으로 문의자와 같은 사람이라는 뜻은 아닙니다. Aside와 알림톡 기록 등으로 직접 확인한 뒤 연결해 주세요. 주문자 이름·연락처는 표시하지 않습니다.</p>
    {!enabled && <p className="conversion-muted">주문 기록을 볼 권한이 없거나 삭제된 문의입니다.</p>}
    {loading && <p className="conversion-muted">주문 기록을 확인하고 있습니다.</p>}
    {!loading && !error && !orders.length && <p className="conversion-muted">문의 뒤 90일 안에 같은 상품·기수로 결제된 주문이 없습니다.</p>}
    {error && <p role="alert" className="conversion-alert">{error}</p>}
    {linked.map(order => <div className="conversion-order-card" key={order.id}>
      <strong>연결된 주문 · {orderStatusLabels[order.status] || order.status}</strong>
      <p>{order.item_name} · {displayTime(order.paid_at)} · {Number(order.total_amount).toLocaleString('ko-KR')}원</p>
      {order.refund_amount > 0 && <p>완료된 환불 {order.refund_amount.toLocaleString('ko-KR')}원</p>}
      <small>주문 기록은 직원이 직접 연결했습니다.</small>
      <AdminButton disabled={pending || !enabled} onClick={() => void link(order, 'unlink')}>문의 연결 해제</AdminButton>
    </div>)}
    {candidates.map(order => <div className="conversion-order-card" key={order.id}>
      <strong>{orderStatusLabels[order.status] || order.status}</strong>
      <p>{order.item_name} · {displayTime(order.paid_at)} · {Number(order.total_amount).toLocaleString('ko-KR')}원</p>
      {order.refund_amount > 0 && <p>완료된 환불 {order.refund_amount.toLocaleString('ko-KR')}원</p>}
      <AdminButton disabled={pending || !enabled} onClick={() => void link(order, 'link')}>확인한 주문으로 연결</AdminButton>
    </div>)}
    <small className="conversion-muted">주문 연결은 직원이 확인해 직접 하는 기록 작업입니다. Jev가 주문자를 추정하거나, 고객에게 답변을 보내거나, 결제·환불을 처리하지 않습니다.</small>
  </AdminSection>;
}

function PurchaseOutcomeForm({ item, pending, enabled, mutate }: { item: ConversionCase; pending: boolean; enabled: boolean; mutate: Mutation }) {
  const [outcome, setOutcome] = useState<ConversionCase['purchase_outcome']>(item.purchase_outcome || 'unknown');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      await mutate({ action: 'manage_case', operation: 'purchase_outcome', case_id: item.id, expected_version: item.input_version, purchase_outcome: outcome });
    } catch (cause) { setError((cause as Error).message); }
  }
  return <AdminSection title="나중에 결제했는지" bordered>
    <p className="conversion-muted">직원이 확인한 내용을 직접 기록합니다. 확인한 직원과 시각도 남습니다. 결제 내역을 자동으로 조회하지 않으며, 확인하기 전에는 ‘아직 모름’으로 둡니다.</p>
    {!enabled && <p className="conversion-muted">문의 관리 기능을 준비 중입니다. 잠시 뒤 새로고침해 주세요.</p>}
    {item.purchase_checked_at && <p>마지막 확인: {displayTime(item.purchase_checked_at)}</p>}
    <form className="conversion-form" onSubmit={submit}>
      <AdminSelect label="결제 확인 결과" value={outcome} onChange={event => setOutcome(event.target.value as ConversionCase['purchase_outcome'])} disabled={pending || !enabled || Boolean(item.archived_at)}>
        <option value="unknown">아직 확인하지 않음</option><option value="paid">결제한 것을 확인함</option><option value="not_paid">결제하지 않은 것을 확인함</option>
      </AdminSelect>
      {error && <p role="alert" className="conversion-alert">{error}</p>}
      <AdminButton type="submit" tone="primary" disabled={pending || !enabled || Boolean(item.archived_at)}>결제 여부 저장</AdminButton>
    </form>
  </AdminSection>;
}

function AsidePaymentMatchPrompt({ item, courseName, cohortName, enabled }: { item: ConversionCase; courseName: string; cohortName: string; enabled: boolean }) {
  const [prompt, setPrompt] = useState(() => buildAsidePaymentMatchPrompt({ receivedAt: item.received_at, courseName, cohortName }));
  const [message, setMessage] = useState('');
  return <AdminSection title="Aside로 결제 여부 확인" bordered>
    <p className="conversion-muted">이 문구를 복사해 Aside에 붙여넣으면 주문 시각과 카카오 알림톡 기록을 함께 살펴보도록 안내합니다. 이름·연락처·문의 내용은 복사하지 않습니다. 시간만 비슷한 경우에는 확정하지 않고, 결제 여부는 직원이 확인해 직접 저장합니다.</p>
    {!enabled && <p className="conversion-alert">주문·메시지 기록 확인 권한이 있는 직원만 이 문구를 사용할 수 있습니다.</p>}
    <AdminTextarea label="Aside에 붙여넣을 문구 · 필요하면 고칠 수 있어요" value={prompt} onChange={event => { setPrompt(event.target.value); setMessage(''); }} rows={11} disabled={!enabled} />
    <AdminButton disabled={!enabled} onClick={async () => {
      try { await navigator.clipboard.writeText(prompt); setMessage('Aside에 붙여넣을 문구를 복사했습니다.'); }
      catch { setMessage('자동 복사에 실패했습니다. 위 문구를 직접 선택해 복사해 주세요.'); }
    }}>Aside용 문구 복사</AdminButton>
    {message && <p role="status" className="conversion-muted">{message}</p>}
  </AdminSection>;
}

function JevV4ReviewPanel({ run, disabled, onRun }: { run?: ConversionJevV4Run; disabled: boolean; onRun: () => void }) {
  const keys: JevV4DecisionKey[] = ['information_need', 'confirmed_barrier', 'attempted_action_target', 'operational_issue', 'paid_program_reference', 'observable_stage'];
  const result = run?.status === 'completed' ? run.result : null;
  const uncertaintyByDecision = new Map<JevV4DecisionKey, string[]>();
  for (const flag of result?.uncertainty_flags || []) uncertaintyByDecision.set(flag.decision, [...(uncertaintyByDecision.get(flag.decision) || []), jevV4UncertaintyLabels[flag.reason] || flag.reason]);
  const consistencyLabels: Record<string, string> = {
    paid_attempt_without_paid_target: '유료 신청·결제로 봤지만, 실제로 시도한 대상이 유료인지 분명하지 않습니다.',
    paid_failure_without_paid_target: '유료 신청·결제 실패로 봤지만, 실제로 시도한 대상이 유료인지 분명하지 않습니다.',
    free_failure_without_free_target: '무료 자료 이용 실패로 봤지만, 실제로 이용하려던 대상이 무료인지 분명하지 않습니다.',
    paid_reference_without_stage: '유료 교육은 언급했지만, 구매 행동은 확인되지 않았다고 봤습니다.',
    paid_stage_without_reference: '유료 교육은 언급되지 않았지만, 구매 신호가 있다고 봤습니다.',
  };
  return <section className="conversion-v2-result" aria-label="무료 자료 접근과 유료 관심 참고 분류">
    <h4>무료 자료 문제와 유료 관심 구분</h4>
    <p className="conversion-muted">Jev가 문의 문장에서 무료 콘텐츠 이용 문제와 유료 교육 관심을 나눠 봅니다. 직원이 상담을 처리할 때 참고하는 내용입니다.</p>
    <AdminButton disabled={disabled || run?.status === 'completed' || run?.status === 'pending'} onClick={onRun}>
      {run?.status === 'completed' ? '구분 결과 확인 완료' : run?.status === 'pending' ? '구분 결과를 만드는 중' : run?.status === 'failed' ? '다시 구분하기' : '무료·유료 구분 결과 보기'}
    </AdminButton>
    {result && <>
      <dl>{keys.map(key => {
        const decision = result.decisions[key];
        const flags = uncertaintyByDecision.get(key) || [];
        return <div key={key}><dt>{jevV4Labels[key]}</dt><dd>{jevV4Choices[decision.choice] || decision.choice} · Jev가 표시한 확신 {confidence(decision.confidence)}{flags.length ? ` · 다시 볼 부분: ${flags.join(', ')}` : ''}</dd></div>;
      })}</dl>
      {result.consistency_flags.length > 0 && <p role="alert" className="conversion-alert">결과끼리 맞지 않는 부분이 있습니다. {result.consistency_flags.map(flag => consistencyLabels[flag] || flag).join(' ')} 문의 내용과 함께 확인해 주세요.</p>}
      {result.consistency_flags.length === 0 && result.uncertainty_flags.length === 0 && <p className="conversion-muted">따로 다시 볼 부분은 표시되지 않았습니다. 그래도 문의 내용과 함께 확인해 주세요.</p>}
      <p className="conversion-muted">이 확신은 Jev가 스스로 표시한 값이며, 실제로 맞을 확률이나 정확도를 뜻하지 않습니다. 판정 결과는 직원 확인용이며 고객에게 보내지 않습니다.</p>
    </>}
  </section>;
}

function ReviewForm({ runId, caseId, initialReply, stale, pending, mutate }: { runId: string; caseId: string; initialReply: string; stale: boolean; pending: boolean; mutate: Mutation }) {
  const [decision, setDecision] = useState('hold');
  const [reply, setReply] = useState(initialReply);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try { await mutate({ action: 'review', case_id: caseId, run_id: runId, decision, reply_text: reply, reason,
      calibration: null, calibration_sample_kind: null }); }
    catch (cause) { setError((cause as Error).message); }
  }
  return <form onSubmit={submit} className="conversion-form">
    <AdminTextarea label="고객에게 보낼 답변 초안" value={reply} onChange={event => { setReply(event.target.value); if (decision === 'accept') setDecision('edit'); }} rows={7} maxLength={10000} disabled={pending || stale} helper="승인하면 직원 확인 기록만 남습니다. 이 화면에서는 고객에게 보내지 않습니다." />
    <AdminSelect label="검토 결정" value={decision} onChange={event => setDecision(event.target.value)} disabled={pending || stale}>
      <option value="hold">보류</option><option value="accept" disabled={!initialReply.trim() || reply !== initialReply}>그대로 승인</option><option value="edit" disabled={!reply.trim()}>수정 후 승인</option><option value="reject">사용 안 함</option>
    </AdminSelect>
    <AdminTextarea label="검토 사유" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} required={decision !== 'accept'} disabled={pending || stale} />
    {error && <p role="alert" className="conversion-alert">{error}</p>}
    <AdminButton type="submit" tone="primary" disabled={pending || stale || (['accept', 'edit'].includes(decision) && !reply.trim())}>{decision === 'hold' ? '보류 기록' : decision === 'reject' ? '사용 안 함 기록' : '직원 승인 기록'}</AdminButton>
  </form>;
}

function CaseForm({ snapshot, item, initialSource, pending, mutate, runJevV4, onSaved }: { snapshot: ConversionSnapshot; item?: ConversionCase; initialSource: 'native' | 'manual'; pending: boolean; mutate: Mutation; runJevV4: (runId: string) => Promise<void>; onSaved: (id: string, note?: string) => void }) {
  const [source, setSource] = useState(item?.source_type || initialSource);
  const [sampleOrigin, setSampleOrigin] = useState(item?.sample_origin || (item || initialSource === 'manual' ? 'current' : ''));
  const [legacyCourseLabel, setLegacyCourseLabel] = useState(item?.legacy_course_label || '');
  const [questionId, setQuestionId] = useState(item?.question_id || '');
  const [courseId, setCourseId] = useState(item?.course_id || '');
  const [cohortId, setCohortId] = useState(item?.cohort_id || '');
  const [subject, setSubject] = useState(item?.subject || '');
  const [content, setContent] = useState(item?.content || '');
  const [sourceLabel, setSourceLabel] = useState(item?.source_label || (initialSource === 'manual' ? '카카오 채널 1:1 상담' : ''));
  const [receivedAt, setReceivedAt] = useState(item ? new Date(new Date(item.received_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
  const [deidentifiedConfirmed, setDeidentifiedConfirmed] = useState(false);
  const [error, setError] = useState('');
  const question = snapshot.questions.find(row => row.id === questionId);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const result = await mutate({ action: 'save_case', ...(item ? { id: item.id, expected_version: item.input_version } : {}), question_id: source === 'native' ? questionId : null, course_id: courseId || null, cohort_id: cohortId || null, sample_origin: source === 'native' ? 'current' : sampleOrigin, legacy_course_label: sampleOrigin === 'external_legacy' ? legacyCourseLabel : null, ...(source === 'manual' ? { subject: subject || content.trim().split(/\r?\n/)[0].slice(0, 200) || '카카오 채널 문의', content, source_label: sourceLabel, received_at: new Date(receivedAt).toISOString(), deidentified_confirmed: deidentifiedConfirmed } : {}) });
      const savedCase = result.case as ConversionCase;
      let note = item ? '문의 내용을 수정했습니다.' : '문의 내용을 저장했습니다.';
      if (!item && source === 'manual' && sampleOrigin === 'current' && snapshot.capabilities.can_jev) {
        try {
          const analyzed = await mutate({ action: 'analyze', case_id: savedCase.id, expected_version: savedCase.input_version });
          const run = analyzed.run as { id?: string } | undefined;
          if (!run?.id) throw new Error('Jev 결과를 찾을 수 없습니다.');
          if (snapshot.capabilities.can_jev_v4) await runJevV4(run.id);
          note = '문의가 저장됐고 Jev 분류와 답변 초안을 만들었습니다. 아래 문의 카드에서 확인해 주세요.';
        } catch {
          note = '문의는 저장됐지만 Jev 결과를 만들지 못했습니다. 문의 카드에서 다시 실행해 주세요.';
        }
      }
      onSaved(savedCase.id, note);
    } catch (cause) { setError((cause as Error).message); }
  }
  return <form className="conversion-form admin-dialog-body" onSubmit={submit}>
    <AdminSelect label="문의 출처" value={source} disabled={pending || Boolean(item)} onChange={event => { const value = event.target.value as 'native' | 'manual'; setSource(value); setSampleOrigin(value === 'native' ? 'current' : ''); }}><option value="native">사이트 질문함</option><option value="manual">외부 문의 수동 등록</option></AdminSelect>
    {source === 'native' ? <>
      <AdminSelect label="사이트 문의" required value={questionId} disabled={pending || Boolean(item)} onChange={event => { setQuestionId(event.target.value); const next = snapshot.questions.find(row => row.id === event.target.value); setCourseId(next?.course_id || ''); setCohortId(''); }}><option value="">문의 선택</option>{snapshot.questions.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</AdminSelect>
      <p className="conversion-quote">{question?.content || item?.content || '선택한 문의의 내용이 표시됩니다.'}</p>
      {item && <p className="conversion-muted">저장하면 질문함의 최신 원문을 다시 연결합니다.</p>}
    </> : <>
      <AdminSelect label="문의 시기" required value={sampleOrigin} disabled={pending || Boolean(item)} onChange={event => { setSampleOrigin(event.target.value as 'current' | 'external_legacy'); setCourseId(''); setCohortId(''); }} helper="과거 문의는 당시 배경을 참고하기 위한 기록입니다. 새 Jev 성능 점수에는 합치지 않습니다."><option value="">선택</option><option value="current">현재 교육 상담</option><option value="external_legacy">과거 유료 교육 상담</option></AdminSelect>
      {sampleOrigin === 'external_legacy' && <AdminInput label="당시 유료 교육 상품명" value={legacyCourseLabel} onChange={event => setLegacyCourseLabel(event.target.value)} required maxLength={200} disabled={pending} helper="상품명이 확인되지 않으면 ‘상품명 미확인’으로 기록하세요. 현재 문샷 챌린지 4기로 추정해 연결하지 않습니다." />}
      <AdminInput label="문의 제목" value={subject} onChange={event => setSubject(event.target.value)} maxLength={200} disabled={pending} placeholder="비워 두면 문의 첫 문장을 제목으로 사용합니다." />
      <AdminTextarea label="문의 내용" value={content} onChange={event => setContent(event.target.value)} required maxLength={10000} rows={7} disabled={pending} helper="카카오 문의 내용을 그대로 붙여넣어 주세요. 저장 전에 고객 이름·별명·연락처·계정 ID·링크·주문번호를 지워 주세요. 저장이 끝나면 Jev가 바로 분류하고 답변 초안을 만듭니다." />
      <AdminInput label="출처 설명" value={sourceLabel} onChange={event => setSourceLabel(event.target.value)} required maxLength={200} disabled={pending} placeholder="예: 카카오 채널 1:1 상담" />
      <AdminInput label="문의 접수 시각" type="datetime-local" value={receivedAt} onFocus={() => { if (!receivedAt) setReceivedAt(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)); }} onChange={event => setReceivedAt(event.target.value)} required disabled={pending} />
      <p className="conversion-muted">문의는 저장되지만 카카오 계정과 사이트 회원이 자동으로 연결되지는 않습니다. 이름이나 문의 시각으로 회원·결제를 추정하지 않습니다. 연결되지 않은 문의는 나중에 결제 여부를 알 수 없습니다.</p>
      <label className="checkline"><input type="checkbox" checked={deidentifiedConfirmed} onChange={event => setDeidentifiedConfirmed(event.target.checked)} required disabled={pending} />고객 식별정보를 제거한 발췌임을 확인했습니다.</label>
    </>}
    <AdminSelect label="대상 상품" required={sampleOrigin !== 'external_legacy'} value={courseId} disabled={pending || Boolean(source === 'native' && question?.course_id)} onChange={event => { setCourseId(event.target.value); setCohortId(''); }} helper={sampleOrigin === 'external_legacy' ? '당시 상품과 동일한 DEV 상품이 확인된 경우에만 연결합니다. 미확인이면 비워 두세요.' : undefined}><option value="">{sampleOrigin === 'external_legacy' ? '현행 상품 연결 안 함' : '상품 선택'}</option>{snapshot.courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</AdminSelect>
    {sampleOrigin !== 'external_legacy' && <AdminSelect label="대상 기수" value={cohortId} disabled={pending} onChange={event => setCohortId(event.target.value)}><option value="">기수 미지정</option>{snapshot.cohorts.filter(cohort => cohort.course_id === courseId).map(cohort => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}</AdminSelect>}
    {error && <p role="alert" className="conversion-alert">{error}</p>}
    <AdminButton type="submit" tone="primary" disabled={pending || (sampleOrigin !== 'external_legacy' && !courseId) || (source === 'native' && !questionId) || (source === 'manual' && (!sampleOrigin || !deidentifiedConfirmed || (sampleOrigin === 'external_legacy' && !legacyCourseLabel.trim())))}>{!item && source === 'manual' && sampleOrigin === 'current' && snapshot.capabilities.can_jev ? '저장하고 Jev로 바로 살펴보기' : '문의 저장'}</AdminButton>
  </form>;
}

function EvidenceForm({ snapshot, item, initialCourse, pending, mutate, onSaved }: { snapshot: ConversionSnapshot; item?: ConversionEvidence; initialCourse: string; pending: boolean; mutate: Mutation; onSaved: () => void }) {
  const [courseId, setCourseId] = useState(item?.course_id || initialCourse);
  const [cohortId, setCohortId] = useState(item?.cohort_id || '');
  const [title, setTitle] = useState(item?.title || '');
  const [body, setBody] = useState(item?.body || '');
  const [url, setUrl] = useState(item?.source_url || '');
  const [status, setStatus] = useState(item?.status || 'draft');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try { await mutate({ action: 'save_evidence', ...(item ? { id: item.id, expected_version: item.version } : {}), course_id: courseId, cohort_id: cohortId || null, title, body, source_url: url, status }); onSaved(); }
    catch (cause) { setError((cause as Error).message); }
  }
  return <form className="conversion-form admin-dialog-body" onSubmit={submit}>
    <AdminSelect label="자료 적용 상품" required value={courseId} disabled={pending} onChange={event => { setCourseId(event.target.value); setCohortId(''); }}><option value="">상품 선택</option>{snapshot.courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</AdminSelect>
    <AdminSelect label="자료 적용 기수" value={cohortId} disabled={pending} onChange={event => setCohortId(event.target.value)}><option value="">상품 공통</option>{snapshot.cohorts.filter(cohort => cohort.course_id === courseId).map(cohort => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}</AdminSelect>
    <AdminInput label="설명자료 제목" value={title} onChange={event => setTitle(event.target.value)} required maxLength={200} disabled={pending} />
    <AdminTextarea label="확인된 설명" value={body} onChange={event => setBody(event.target.value)} required maxLength={10000} rows={7} disabled={pending} />
    <AdminInput label="근거 원문 주소" type="url" value={url} onChange={event => setUrl(event.target.value)} required maxLength={2000} disabled={pending} />
    <AdminSelect label="자료 상태" value={status} onChange={event => setStatus(event.target.value as ConversionEvidence['status'])} disabled={pending} helper="승인은 이 상품에 안내해도 되는 설명임을 확인한 기록입니다."><option value="draft">초안</option><option value="approved">승인</option><option value="retired">철회</option></AdminSelect>
    {error && <p role="alert" className="conversion-alert">{error}</p>}
    <AdminButton type="submit" tone="primary" disabled={pending}>설명자료 저장</AdminButton>
  </form>;
}
