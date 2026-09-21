'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { ConversionCase, ConversionEvidence, ConversionSnapshot } from '@/lib/conversion-review';
import { isRunStale } from '@/lib/conversion-review';
import { createMutationGate } from '@/lib/mutation-gate';
import { safeUrl } from '@/lib/platform';
import {
  AdminButton, AdminDrawer, AdminEmptyState, AdminInput, AdminPage,
  AdminPageHeader, AdminSearchField, AdminSection, AdminSelect, AdminTextarea,
} from './final/admin-system';
import './conversion-review.css';
import { RecruitmentRoomSettings } from './recruitment-rooms';
import { RecruitmentFunnel } from './recruitment-funnel';

const topicNames: Record<string, string> = { price: '가격', schedule: '일정', content: '교육 내용', level: '수강 수준', usage: '이용 방법' };
const inquiryNames: Record<string, string> = { prepurchase: '구매 전 상품 질문', support: '이용 지원', payment_refund: '결제·환불', mixed: '여러 종류의 문의', unknown: '판단 불가' };
const decisionNames: Record<string, string> = { accept: '채택', edit: '수정', hold: '보류', reject: '사용 안 함' };
const displayTime = (value: string) => new Date(value).toLocaleString('ko-KR');
type Mutation = (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;

async function readResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || '요청을 처리하지 못했습니다.'), { status: response.status });
  return data;
}

export function ConversionReview({ workspace = false }: { workspace?: boolean }) {
  const [workspaceView, setWorkspaceView] = useState<'recruitment' | 'inquiries'>('recruitment');
  const [snapshot, setSnapshot] = useState<ConversionSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drawer, setDrawer] = useState<'case' | 'evidence' | null>(null);
  const [showFunnel, setShowFunnel] = useState(false);
  const [editingCase, setEditingCase] = useState<ConversionCase | undefined>();
  const [editingEvidence, setEditingEvidence] = useState<ConversionEvidence | undefined>();
  const gate = useRef(createMutationGate<Record<string, unknown>>());
  const active = useRef(true);
  const read = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    setLoading(true);
    try {
      const data = await readResponse(await fetch('/api/conversion', { cache: 'no-store', signal: controller.signal }));
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
  }, []);

  useEffect(() => {
    active.current = true;
    const timer = setTimeout(() => void refresh(), 0);
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
        analyze: '모의 판단을 저장했습니다. 설명을 확인한 뒤 검토 결정을 남겨 주세요.',
        review: '검토 기록을 저장했습니다. 고객에게 전달된 답변은 아닙니다.',
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

  const selected = snapshot?.cases.find(item => item.id === selectedId);
  const cases = snapshot?.cases.filter(item => (item.subject + ' ' + item.content).toLowerCase().includes(query.toLowerCase())) || [];
  const run = snapshot?.runs.filter(item => item.case_id === selected?.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const stale = Boolean(run && selected && snapshot && isRunStale(run, selected, snapshot.evidence));
  const records = snapshot?.reviews.filter(item => item.case_id === selected?.id).sort((a, b) => b.created_at.localeCompare(a.created_at)) || [];
  const openCase = (item?: ConversionCase) => { setEditingCase(item); setDrawer('case'); };
  const openEvidence = (item?: ConversionEvidence) => { setEditingEvidence(item); setDrawer('evidence'); };

  return <AdminPage width="wide" template="review" className="conversion-review">
    <AdminPageHeader title={workspace ? "모집 운영" : "전환 관리"} description={workspace ? "모집별 연결·구매 현황·후속 안내를 한곳에서 관리합니다." : "문의에 필요한 설명을 찾고, 검토한 내용을 기록합니다."} eyebrow="MARKETING" actions={<>
      <AdminButton disabled={pending || loading} onClick={() => void refresh()}>새로고침</AdminButton>
      {snapshot && (!workspace || workspaceView === 'inquiries') && <AdminButton tone="primary" disabled={pending} onClick={() => openCase()}>문의 연결</AdminButton>}
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
          {snapshot.capabilities.can_manage_funnel ? <RecruitmentRoomSettings courses={snapshot.courses} cohorts={snapshot.cohorts} expanded /> : <p>모집 설정에는 마케팅·상품 관리 권한이 필요합니다.</p>}
        </div>
      </> : <>      <div className="funnel-entry"><AdminButton aria-expanded={showFunnel} aria-controls="recruitment-funnel-preparation" onClick={() => setShowFunnel(value => !value)}>{showFunnel ? '모집 경로 준비 닫기' : '모집 경로 준비'}</AdminButton><span className="conversion-muted">무료 교육부터 유료 구매까지 연결할 경로를 확인합니다.</span></div>
      {showFunnel && <div id="recruitment-funnel-preparation"><RecruitmentFunnel key={String(snapshot.capabilities.can_manage_funnel)} courses={snapshot.courses} cohorts={snapshot.cohorts} canSave={snapshot.capabilities.can_manage_funnel === true} /></div>}
</>}
      <div hidden={workspace && workspaceView !== 'inquiries'}>
      <div className="conversion-intro"><span className="conversion-tag">운영자 검토</span><p>설명 추천과 고객 답변을 구분해서 관리합니다. 이 화면에 저장한 내용은 자동 발송되지 않습니다.</p></div>
      <div className="conversion-grid" aria-busy={pending || loading}>
        <AdminSection title="문의" description={`불러온 문의 ${snapshot.cases.length}건`} bordered>
          <AdminSearchField label="문의 검색" value={query} onChange={event => setQuery(event.target.value)} />
          <div className="conversion-case-list">
            {cases.map(item => <button type="button" key={item.id} className={'conversion-case' + (selectedId === item.id ? ' is-selected' : '')} disabled={pending} aria-pressed={selectedId === item.id} onClick={() => { setSelectedId(item.id); setNotice(''); }}>
              <span>{item.source_type === 'native' ? '사이트 문의' : '외부 문의'}</span><strong>{item.subject}</strong>
              <small>{snapshot.courses.find(course => course.id === item.course_id)?.title || '연결 상품'}</small>
              <small>{displayTime(item.received_at)}</small>
            </button>)}
            {!cases.length && <AdminEmptyState compact title={query ? '검색 결과가 없습니다.' : '아직 연결한 문의가 없습니다.'}>문의 연결에서 검토할 문의를 선택하세요.</AdminEmptyState>}
          </div>
        </AdminSection>
        <div className="conversion-main">
          {!selected ? <AdminEmptyState title="검토할 문의를 선택하세요.">문의와 상품을 연결하면 설명자료를 함께 검토할 수 있습니다.</AdminEmptyState> : <>
            <AdminSection title={selected.subject} bordered actions={<AdminButton disabled={pending} onClick={() => openCase(selected)}>문의 정보 수정</AdminButton>}>
              <dl className="conversion-meta"><dt>상품</dt><dd>{snapshot.courses.find(course => course.id === selected.course_id)?.title || '연결 상품'}</dd><dt>기수</dt><dd>{snapshot.cohorts.find(cohort => cohort.id === selected.cohort_id)?.name || '미지정'}</dd><dt>고객 연결</dt><dd>{selected.customer_id ? '사이트 문의의 회원 연결 확인' : '미연결 · 개인별 구매 관찰 불가'}</dd><dt>출처</dt><dd>{selected.source_label}</dd></dl>
              <p className="conversion-quote">{selected.content}</p>
              {selected.question_id && <Link href="/admin/questions" className="conversion-link">기존 질문함 열기</Link>}
            </AdminSection>
            <AdminSection title="설명 추천" bordered actions={<AdminButton tone="primary" disabled={pending || !snapshot.capabilities.can_mock} onClick={() => void mutate({ action: 'analyze', case_id: selected.id, expected_version: selected.input_version }).catch(() => {})}>{pending ? '처리 중' : '모의 판단 실행'}</AdminButton>}>
              {!snapshot.capabilities.can_mock && <p className="conversion-muted">현재 환경에서는 모의 판단을 실행할 수 없습니다. 설명자료는 직접 검토할 수 있습니다.</p>}
              {run ? <div className="conversion-result">
                <span className="conversion-tag">모의 판단 · 운영자 확인 필요</span>
                <p>{run.result.notice}</p>
                {stale && <p role="alert" className="conversion-alert">문의나 설명자료가 바뀌었습니다. 새로 판단한 뒤 검토 기록을 남겨 주세요.</p>}
                <p><strong>문의 구분</strong> · {inquiryNames[run.result.inquiry_type]}</p>
                <div className="conversion-topics">{run.result.topics.filter(topic => topic.status === 'explicit').map(topic => <span key={topic.topic} className="conversion-tag">{topicNames[topic.topic]}</span>)}</div>
                {run.result.missing_topics.length > 0 && <p className="conversion-alert">추가 확인 필요: {run.result.missing_topics.map(topic => topicNames[topic]).join(', ')}</p>}
                {run.result.candidates.filter(candidate => candidate.fit !== 'irrelevant').map(candidate => {
                  const evidence = run.evidence_snapshot?.find(item => item.id === candidate.evidence_id) || snapshot.evidence.find(item => item.id === candidate.evidence_id);
                  return <div key={candidate.evidence_id} className="conversion-evidence"><strong>{evidence?.title || '자료 확인 필요'}</strong><p>{candidate.reason}</p>{evidence && evidence.version === candidate.evidence_version ? <p className="conversion-quote">{evidence.body}</p> : <p className="conversion-muted">판단 이후 자료가 변경됐습니다. 당시 조합한 설명은 아래 검토 내용에 보존됩니다.</p>}</div>;
                })}
                <ReviewForm key={run.id} runId={run.id} caseId={selected.id} initialReply={run.result.proposed_reply} stale={stale} pending={pending} mutate={mutate} />
              </div> : <AdminEmptyState compact title="아직 판단 기록이 없습니다.">아래 설명자료를 확인한 뒤 모의 판단을 실행하세요.</AdminEmptyState>}
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
        <AdminSection title="검토·적용 기록" bordered>
          <p className="conversion-muted">검토 결정과 실제 답변은 별도입니다.</p>
          {records.map(record => <article className="conversion-record" key={record.id}><strong>{decisionNames[record.decision]}</strong><small>{displayTime(record.created_at)}</small>{record.reply_text && <p className="conversion-quote">{record.reply_text}</p>}{record.reason && <p>사유: {record.reason}</p>}<span className="conversion-tag">검토 저장 · 실제 적용 미확인</span></article>)}
          {!records.length && <AdminEmptyState compact title="아직 검토 기록이 없습니다." />}
          <div className="conversion-next"><strong>구매·환불 결과</strong><p>주문 연결은 준비 중입니다. 현재 화면의 기록으로 구매 성과를 계산하지 않습니다.</p></div>
        </AdminSection>
      </div>
      </div>
      {drawer === 'case' && <AdminDrawer title={editingCase ? '문의 정보 수정' : '문의 연결'} onClose={() => { if (!pending) setDrawer(null); }}>
        <CaseForm key={editingCase?.id || 'new'} snapshot={snapshot} item={editingCase} pending={pending} mutate={mutate} onSaved={id => { setSelectedId(id); setDrawer(null); }} />
      </AdminDrawer>}
      {drawer === 'evidence' && <AdminDrawer title={editingEvidence ? '설명자료 수정' : '설명자료 등록'} onClose={() => { if (!pending) setDrawer(null); }}>
        <EvidenceForm key={editingEvidence?.id || 'new'} snapshot={snapshot} item={editingEvidence} initialCourse={selected?.course_id || ''} pending={pending} mutate={mutate} onSaved={() => setDrawer(null)} />
      </AdminDrawer>}
    </>}
  </AdminPage>;
}

function ReviewForm({ runId, caseId, initialReply, stale, pending, mutate }: { runId: string; caseId: string; initialReply: string; stale: boolean; pending: boolean; mutate: Mutation }) {
  const [decision, setDecision] = useState('hold');
  const [reply, setReply] = useState(initialReply);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try { await mutate({ action: 'review', case_id: caseId, run_id: runId, decision, reply_text: reply, reason }); }
    catch (cause) { setError((cause as Error).message); }
  }
  return <form onSubmit={submit} className="conversion-form">
    <AdminTextarea label="검토할 설명" value={reply} onChange={event => { setReply(event.target.value); if (decision === 'accept') setDecision('edit'); }} rows={7} maxLength={10000} disabled={pending || stale} helper="고객에게 전달하기 전 상품 조건과 근거를 확인하세요." />
    <AdminSelect label="검토 결정" value={decision} onChange={event => setDecision(event.target.value)} disabled={pending || stale}>
      <option value="hold">보류</option><option value="accept" disabled={reply !== initialReply}>채택</option><option value="edit">수정</option><option value="reject">사용 안 함</option>
    </AdminSelect>
    <AdminTextarea label="검토 사유" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} required={decision !== 'accept'} disabled={pending || stale} />
    {error && <p role="alert" className="conversion-alert">{error}</p>}
    <AdminButton type="submit" tone="primary" disabled={pending || stale}>검토 기록 저장</AdminButton>
  </form>;
}

function CaseForm({ snapshot, item, pending, mutate, onSaved }: { snapshot: ConversionSnapshot; item?: ConversionCase; pending: boolean; mutate: Mutation; onSaved: (id: string) => void }) {
  const [source, setSource] = useState(item?.source_type || 'native');
  const [questionId, setQuestionId] = useState(item?.question_id || '');
  const [courseId, setCourseId] = useState(item?.course_id || '');
  const [cohortId, setCohortId] = useState(item?.cohort_id || '');
  const [subject, setSubject] = useState(item?.subject || '');
  const [content, setContent] = useState(item?.content || '');
  const [sourceLabel, setSourceLabel] = useState(item?.source_label || '');
  const [receivedAt, setReceivedAt] = useState(item ? new Date(new Date(item.received_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
  const [error, setError] = useState('');
  const question = snapshot.questions.find(row => row.id === questionId);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const result = await mutate({ action: 'save_case', ...(item ? { id: item.id, expected_version: item.input_version } : {}), question_id: source === 'native' ? questionId : null, course_id: courseId, cohort_id: cohortId || null, ...(source === 'manual' ? { subject, content, source_label: sourceLabel, received_at: new Date(receivedAt).toISOString() } : {}) });
      onSaved((result.case as ConversionCase).id);
    } catch (cause) { setError((cause as Error).message); }
  }
  return <form className="conversion-form admin-dialog-body" onSubmit={submit}>
    <AdminSelect label="문의 출처" value={source} disabled={pending || Boolean(item)} onChange={event => setSource(event.target.value as 'native' | 'manual')}><option value="native">사이트 질문함</option><option value="manual">외부 문의 수동 등록</option></AdminSelect>
    {source === 'native' ? <>
      <AdminSelect label="사이트 문의" required value={questionId} disabled={pending || Boolean(item)} onChange={event => { setQuestionId(event.target.value); const next = snapshot.questions.find(row => row.id === event.target.value); setCourseId(next?.course_id || ''); setCohortId(''); }}><option value="">문의 선택</option>{snapshot.questions.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</AdminSelect>
      <p className="conversion-quote">{question?.content || item?.content || '선택한 문의의 내용이 표시됩니다.'}</p>
      {item && <p className="conversion-muted">저장하면 질문함의 최신 원문을 다시 연결합니다.</p>}
    </> : <>
      <AdminInput label="문의 제목" value={subject} onChange={event => setSubject(event.target.value)} required maxLength={200} disabled={pending} />
      <AdminTextarea label="문의 발췌" value={content} onChange={event => setContent(event.target.value)} required maxLength={10000} rows={5} disabled={pending} helper="이름·연락처 등 개인정보를 제외한 필요한 내용만 입력하세요." />
      <AdminInput label="출처 설명" value={sourceLabel} onChange={event => setSourceLabel(event.target.value)} required maxLength={200} disabled={pending} placeholder="예: 상담 채널의 구매 문의" />
      <AdminInput label="문의 접수 시각" type="datetime-local" value={receivedAt} onChange={event => setReceivedAt(event.target.value)} required disabled={pending} />
      <p className="conversion-muted">외부 문의는 고객 미연결로 저장됩니다. 이름이나 유입 경로로 회원을 추정하지 않습니다.</p>
    </>}
    <AdminSelect label="대상 상품" required value={courseId} disabled={pending || Boolean(source === 'native' && question?.course_id)} onChange={event => { setCourseId(event.target.value); setCohortId(''); }}><option value="">상품 선택</option>{snapshot.courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</AdminSelect>
    <AdminSelect label="대상 기수" value={cohortId} disabled={pending} onChange={event => setCohortId(event.target.value)}><option value="">기수 미지정</option>{snapshot.cohorts.filter(cohort => cohort.course_id === courseId).map(cohort => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}</AdminSelect>
    {error && <p role="alert" className="conversion-alert">{error}</p>}
    <AdminButton type="submit" tone="primary" disabled={pending || !courseId || (source === 'native' && !questionId)}>문의 저장</AdminButton>
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
