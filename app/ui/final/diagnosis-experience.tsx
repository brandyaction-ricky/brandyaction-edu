'use client';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CloudCheck, LoaderCircle, ShieldCheck } from 'lucide-react';
import { createDiagnosisAutosave } from '@/lib/diagnosis-autosave';
import { diagnosisMissingQuestions, diagnosisQuestionAnswered, type DiagnosisAnswer, type DiagnosisOffer, type DiagnosisQuestion, type DiagnosisSession } from '@/lib/diagnosis-session';
import { DiagnosisReportView } from './diagnosis-report';
import './diagnosis.css';

const endpoint = '/api/platform/diagnosis/session';
async function request(body?: Record<string, unknown>) {
  const response = await fetch(endpoint, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' } : { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(Error(data.error || '잠시 후 다시 시도해 주세요.'), { code: data.code, status: response.status });
  return data;
}
type SaveStatus = 'unsaved' | 'saving' | 'saved' | 'error';
export function DiagnosisExperience({ initialCourseId, reportsEnabled = false }: { initialCourseId?: string; reportsEnabled?: boolean }) {
  const router = useRouter();
  const [session, setSession] = useState<DiagnosisSession | null>(null);
  const [offers, setOffers] = useState<DiagnosisOffer[]>([]), [course, setCourse] = useState(initialCourseId || '');
  const [phase, setPhase] = useState<'loading'|'intro'|'preparing'|'questions'|'review'|'submitted'|'error'>('loading');
  const [answers, setAnswers] = useState<DiagnosisAnswer[]>([]), [index, setIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved'), [error, setError] = useState('');
  const [conflict, setConflict] = useState(false), [pending, setPending] = useState(false);
  const autosave = useRef<ReturnType<typeof createDiagnosisAutosave> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), questionStarted = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const loadVersion = useRef(0);

  function accept(data: DiagnosisSession) {
    setSession(data); setAnswers(data.answers); setConflict(false); setError(''); setSaveStatus('saved');
    autosave.current = createDiagnosisAutosave({ revision: data.revision,
      save: (revision, snapshot) => request({ action: 'save', revision, answers: snapshot }),
      onState: (state, reason) => {
        setSaveStatus(state);
        if (state === 'error') { setError(reason instanceof Error ? reason.message : '답변을 저장하지 못했습니다.'); setConflict((reason as {code?:string})?.code === 'CONFLICT'); }
        if (state === 'saved') setError('');
      } });
    const missing = data.survey.questions.findIndex(q => (q.required || q.pickExactly !== null) && !diagnosisQuestionAnswered(q, data.answers.find(a => a.questionId === q.id)));
    setIndex(missing < 0 ? 0 : missing); questionStarted.current = Date.now();
    setPhase(data.state === 'submitted' ? 'submitted' : 'questions');
  }
  function applyRead(data: DiagnosisSession | { state: 'not_started'; offers: DiagnosisOffer[] } | { state: 'preparing' }) {
    if (data.state === 'not_started') { setOffers(data.offers); setCourse(current => data.offers.some(o => o.courseId === current) ? current : data.offers[0]?.courseId || ''); setPhase('intro'); }
    else if (data.state === 'preparing') setPhase('preparing');
    else accept(data);
  }
  function readFailed(reason: unknown) {
    setError(reason instanceof Error ? reason.message : '검사를 불러오지 못했습니다.'); setPhase('error');
  }
  async function load() {
    const version = ++loadVersion.current;
    if (timer.current) clearTimeout(timer.current);
    try {
      const data = await request();
      if (version !== loadVersion.current) return;
      applyRead(data);
    } catch (reason) { if (version === loadVersion.current) readFailed(reason); }
  }
  useEffect(() => {
    const version = ++loadVersion.current;
    void request().then(data => { if (version === loadVersion.current) applyRead(data); })
      .catch(reason => { if (version === loadVersion.current) readFailed(reason); });
    const beforeUnload = (event: BeforeUnloadEvent) => { if (autosave.current?.dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- This counter intentionally invalidates outstanding network reads on unmount.
    return () => { loadVersion.current++; window.removeEventListener('beforeunload', beforeUnload); if (timer.current) clearTimeout(timer.current); };
    // A session is loaded once. Edits remain in memory until acknowledged by the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { questionStarted.current = Date.now(); heading.current?.focus(); }, [index, phase]);
  const questions = session?.survey.questions ?? [], question = questions[index];
  const selected = question ? answers.find(a => a.questionId === question.id) : undefined;
  const required = questions.filter(q => q.required || q.pickExactly !== null);
  const missing = session ? diagnosisMissingQuestions(session, answers) : [];
  const completed = required.length - missing.length;

  function change(answer: DiagnosisAnswer) {
    const next = [...answers.filter(a => a.questionId !== answer.questionId), answer];
    setAnswers(next); setError(''); autosave.current?.update(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void autosave.current?.flush().catch(() => {}); }, 500);
  }
  async function start() {
    loadVersion.current++;
    setPending(true); setError('');
    try { accept(await request({ action: 'ensure', ...(course ? { courseId: course } : {}) })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '검사를 준비하지 못했습니다.'); }
    finally { setPending(false); }
  }
  function move(next: number) { setIndex(next); setPhase('questions'); if (!conflict && saveStatus !== 'error') setError(''); }
  function next() {
    if ((question.required || question.pickExactly !== null) && !diagnosisQuestionAnswered(question, selected)) {
      setError(question.pickExactly ? `${question.pickExactly}개를 선택해 주세요.` : '나와 가까운 답을 선택해 주세요.'); return;
    }
    if (index === questions.length - 1) setPhase('review'); else move(index + 1);
  }
  async function exit() {
    setPending(true);
    try { await autosave.current?.flush(); router.push('/my'); }
    catch { /* Keep the unsaved answers visible. */ }
    finally { setPending(false); }
  }
  async function submit() {
    if (missing.length) { move(questions.findIndex(q => q.id === missing[0].id)); setError('아직 답하지 않은 필수 문항입니다.'); return; }
    setPending(true); setError('');
    try {
      await autosave.current?.flush();
      accept(await request({ action: 'submit', revision: autosave.current?.revision }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '제출 상태를 확인하지 못했습니다. 다시 시도해 주세요.'); if ((reason as {code?:string})?.code === 'CONFLICT') setConflict(true); }
    finally { setPending(false); }
  }
  return <div className="edu-diagnosis">
    <header className="diagnosis-header"><Image src="/brandy-action-logo.png" alt="Brandy Action EDU" width={164} height={30}/>
      <button type="button" className="diagnosis-exit" onClick={() => void exit()} disabled={pending}><ArrowLeft size={16}/> {session?.state === 'in_progress' ? '저장하고 나가기' : '마이페이지'}</button></header>
    <main className="diagnosis-main">
      {phase === 'loading' ? <div className="diagnosis-center" role="status"><LoaderCircle className="diagnosis-spin"/><p>검사를 불러오고 있어요.</p></div> : <>
        {(phase === 'intro' || phase === 'preparing') && <section className="diagnosis-intro">
          <span className="diagnosis-eyebrow">나를 이해하는 첫걸음</span><h1 ref={heading} tabIndex={-1}>나는 어떤 순간에<br/>나답게 움직일까요?</h1>
          <p className="diagnosis-lead">N6 검사로 나의 욕구와 행동 경향을 알아보세요.<br/>평소의 나와 가까운 답을 고르면 됩니다.</p>
          <div className="diagnosis-promises"><p><CheckCircle2/> 정답을 찾는 시험이 아니에요.</p><p><CloudCheck/> 답변은 자동으로 저장돼요. 중간에 쉬어도 괜찮아요.</p><p><ShieldCheck/> 에듀 계정당 한 번 검사해요. 제출 전까지 수정할 수 있어요.</p></div>
          {phase === 'intro' && offers.length > 1 && <label className="diagnosis-course">검사가 포함된 상품<select value={course} onChange={e => setCourse(e.target.value)}>{offers.map(o => <option key={o.courseId} value={o.courseId}>{o.title}</option>)}</select></label>}
          {phase === 'intro' && !offers.length ? <p className="diagnosis-notice">현재 계정에 이용 가능한 N6 검사가 없습니다. 검사가 포함된 상품의 구매·수강 정보를 확인해 주세요.</p>
            : <><button className="diagnosis-primary" onClick={() => void start()} disabled={pending}>{pending ? '검사 준비 중…' : phase === 'preparing' ? '검사 준비 다시 확인' : '검사 시작하기'}<ArrowRight size={18}/></button><p className="diagnosis-caption">마이인에 따로 가입하지 않아도 이곳에서 검사할 수 있어요.</p></>}
        </section>}
        {(phase === 'questions' || phase === 'review') && session && <>
          <div className="diagnosis-progress"><div><span>나를 이해하는 N6 검사</span><strong>필수 응답 {completed} / {required.length}</strong></div><progress value={completed} max={required.length}/>
            <span className="diagnosis-save" role="status">{saveStatus === 'saved' ? <><CloudCheck size={16}/> 답변이 저장됐어요</> : saveStatus === 'error' ? '저장을 확인해 주세요' : <><LoaderCircle size={16} className="diagnosis-spin"/> 답변 저장 중…</>}</span></div>
          {phase === 'questions' && question && <section className="diagnosis-question" aria-busy={pending}>
            <div className="diagnosis-question-meta"><span>{question.section}</span><span>{index + 1} / {questions.length}{!question.required && question.pickExactly === null ? ' · 건너뛰기 가능' : ''}</span></div>
            <h1 ref={heading} tabIndex={-1}>{question.text}</h1>
            <AnswerControls question={question} answer={selected} disabled={pending || conflict} onChange={answer => change(question.type === 'pair_choice' ? { ...answer, ms: Math.min(600000, Math.max(0, Date.now() - questionStarted.current)) } : answer)}/>
            <div className="diagnosis-navigation"><button className="diagnosis-secondary" onClick={() => move(index - 1)} disabled={!index || pending}><ArrowLeft size={16}/> 이전</button><button className="diagnosis-primary" onClick={next} disabled={pending || conflict}>{index === questions.length - 1 ? '제출 전 확인' : '다음'}<ArrowRight size={18}/></button></div>
            <details className="diagnosis-question-list"><summary>다른 문항으로 이동</summary><div>{questions.map((q, n) => <button key={q.id} disabled={pending} className={diagnosisQuestionAnswered(q, answers.find(a => a.questionId === q.id)) ? 'is-answered' : ''} aria-label={`${n + 1}번 문항${diagnosisQuestionAnswered(q, answers.find(a => a.questionId === q.id)) ? ' 답변 완료' : ''}`} aria-current={n === index ? 'step' : undefined} onClick={() => move(n)}>{n + 1}</button>)}</div></details>
          </section>}
          {phase === 'review' && <section className="diagnosis-review"><span className="diagnosis-eyebrow">마지막 확인</span><h1 ref={heading} tabIndex={-1}>답변을 제출할까요?</h1><p>제출하면 이 답변으로 검사 결과를 만들어요.<br/>제출한 뒤에는 답변을 바꿀 수 없습니다.</p><div className="diagnosis-review-count"><span>필수 문항</span><strong>{missing.length ? `${missing.length}개 남음` : '모두 답했어요'}</strong></div><div className="diagnosis-navigation"><button className="diagnosis-secondary" onClick={() => move(0)} disabled={pending}>답변 다시 보기</button><button className="diagnosis-primary" onClick={() => void submit()} disabled={pending || conflict}>{pending ? '제출 확인 중…' : missing.length ? '빠진 문항 확인' : '답변 제출하기'}<Check size={18}/></button></div></section>}
        </>}
        {phase === 'submitted' && reportsEnabled && <DiagnosisReportView onExit={() => void exit()}/>}
        {phase === 'submitted' && !reportsEnabled && <section className="diagnosis-submitted"><span className="diagnosis-complete-icon"><CheckCircle2 size={32}/></span><h1 ref={heading} tabIndex={-1}>답변을 제출했어요.</h1>{session?.needsReview ? <p>답변은 안전하게 접수됐어요. 결과를 만들기 전 확인이 필요합니다.<br/>추가 결제나 재검사 없이 이곳에서 진행 상태를 확인해 주세요.</p> : <p>검사 결과가 준비되면 이곳에서 확인할 수 있어요.<br/>화면을 닫아도 괜찮고, 다시 제출하지 않아도 됩니다.</p>}<button className="diagnosis-primary" onClick={() => void exit()}>학습으로 돌아가기<ArrowRight size={18}/></button></section>}
        {error && <div className="diagnosis-error" role="alert"><p>{error}</p>
          {conflict ? <button className="diagnosis-secondary" onClick={() => { if (window.confirm('최신 답변을 불러오면 이 화면에서 아직 저장되지 않은 수정 내용은 없어집니다. 불러올까요?')) void load(); }}>최신 답변 불러오기</button>
            : saveStatus === 'error' ? <button className="diagnosis-secondary" onClick={() => void autosave.current?.flush().catch(() => {})}>저장 다시 시도</button>
            : phase === 'error' ? <button className="diagnosis-secondary" onClick={() => void load()}>다시 불러오기</button> : null}</div>}
      </>}
    </main>
  </div>;
}

function AnswerControls({ question: q, answer, disabled, onChange }: { question: DiagnosisQuestion; answer?: DiagnosisAnswer; disabled: boolean; onChange: (a: DiagnosisAnswer) => void }) {
  if (q.type === 'text') return <label className="diagnosis-text"><span className="diagnosis-caption">떠오르는 경험을 편하게 적어 주세요. 답하지 않고 넘어가도 괜찮아요.</span><textarea aria-label={q.text} value={answer?.value ?? ''} placeholder={q.placeholder} maxLength={10000} disabled={disabled} onChange={e => onChange({questionId:q.id,value:e.target.value})}/><span className="diagnosis-caption">{answer?.value?.length ?? 0} / 10,000자</span></label>;
  function toggle(optionId: string) {
    if (q.type !== 'multi_choice') { onChange({ questionId: q.id, optionId }); return; }
    const current = answer?.values ?? [];
    let values = current.includes(optionId) ? current.filter(v => v !== optionId)
      : q.exclusiveOptionIds.includes(optionId) ? [optionId] : [...current.filter(v => !q.exclusiveOptionIds.includes(v)), optionId];
    if (q.pickExactly && values.length > q.pickExactly) values = current;
    onChange({ questionId: q.id, values });
  }
  return <fieldset className="diagnosis-choices" disabled={disabled}><legend className="diagnosis-sr">{q.text}</legend>
    {q.pair && <div className="diagnosis-pair"><div><b>A</b><p>{q.pair.left}</p></div><div><b>B</b><p>{q.pair.right}</p></div></div>}
    {q.pickExactly && <p className="diagnosis-choice-count">{q.pickExactly}개를 선택해 주세요 <strong>{answer?.values?.length ?? 0} / {q.pickExactly}</strong></p>}
    <div className={q.type === 'multi_choice' ? 'diagnosis-options multiple' : 'diagnosis-options'}>{q.options.map(option => {
      const checked = q.type === 'multi_choice' ? answer?.values?.includes(option.id) === true : answer?.optionId === option.id;
      const full = Boolean(q.pickExactly && answer?.values?.length === q.pickExactly && !checked);
      return <label key={option.id} className={`diagnosis-option${checked ? ' selected' : ''}${full ? ' unavailable' : ''}`}><input type={q.type === 'multi_choice' ? 'checkbox' : 'radio'} name={q.id} value={option.id} checked={checked} disabled={disabled || full} onChange={() => toggle(option.id)}/><span>{option.label}</span>{checked && <Check size={18}/>}</label>;
    })}</div>
  </fieldset>;
}
