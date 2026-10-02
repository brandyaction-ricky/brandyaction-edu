'use client';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle } from 'lucide-react';
import type { DiagnosisAnswer, DiagnosisOffer, DiagnosisSession } from '@/lib/diagnosis-session';
import { DiagnosisQuestionnaire } from './diagnosis-questionnaire';
import { DiagnosisReportView } from './diagnosis-report';
import './diagnosis.css';

const endpoint = '/api/platform/diagnosis/session';
async function request(body?: Record<string, unknown>) {
  const response = await fetch(endpoint, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' } : { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(Error(data.error || '잠시 후 다시 시도해 주세요.'), { code: data.code, status: response.status });
  return data;
}
const saveAnswers = (revision: number, answers: DiagnosisAnswer[]) => request({ action: 'save', revision, answers });
export function DiagnosisExperience({ initialCourseId, reportsEnabled = false, adminPilot = false, exitHref = '/my', exitLabel = '마이페이지' }: { initialCourseId?: string; reportsEnabled?: boolean; adminPilot?: boolean; exitHref?: string; exitLabel?: string }) {
  const router = useRouter();
  const [session, setSession] = useState<DiagnosisSession | null>(null);
  const [offers, setOffers] = useState<DiagnosisOffer[]>([]), [course, setCourse] = useState(initialCourseId || '');
  const [phase, setPhase] = useState<'loading'|'intro'|'preparing'|'questions'|'submitted'|'error'>('loading');
  const [error, setError] = useState(''), [pending, setPending] = useState(false), [generation, setGeneration] = useState(0);
  const loadVersion = useRef(0), starting = useRef(false);
  function accept(data: DiagnosisSession) {
    setSession(data); setError(''); setGeneration(n => n + 1);
    setPhase(data.state === 'submitted' ? 'submitted' : 'questions');
  }
  function applyRead(data: DiagnosisSession | { state: 'not_started'; offers: DiagnosisOffer[] } | { state: 'preparing' }) {
    if (data.state === 'not_started') { setOffers(data.offers); setCourse(current => data.offers.some(o => o.courseId === current) ? current : data.offers[0]?.courseId || ''); setPhase('intro'); }
    else if (data.state === 'preparing') setPhase('preparing');
    else accept(data);
  }
  async function load() {
    const version = ++loadVersion.current;
    try { const data = await request(); if (version === loadVersion.current) applyRead(data); }
    catch (reason) { if (version === loadVersion.current) { setError(reason instanceof Error ? reason.message : '검사를 불러오지 못했습니다.'); setPhase('error'); } }
  }
  useEffect(() => {
    const version = ++loadVersion.current;
    void request().then(data => { if (version === loadVersion.current) applyRead(data); })
      .catch(reason => { if (version === loadVersion.current) { setError(reason instanceof Error ? reason.message : '검사를 불러오지 못했습니다.'); setPhase('error'); } });
    // Invalidate outstanding reads on unmount. Starting also invalidates the initial read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { loadVersion.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function start() {
    if (starting.current) return; starting.current = true; loadVersion.current++;
    setPending(true); setError('');
    try { accept(await request({ action: 'ensure', ...(course ? { courseId: course } : {}) })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '검사를 준비하지 못했습니다.'); }
    finally { starting.current = false; setPending(false); }
  }
  if (phase === 'questions' && session) return <DiagnosisQuestionnaire key={generation} initial={session}
    save={saveAnswers}
    submit={async revision => accept(await request({action:'submit',revision}))}
    onReload={async () => accept(await request())} onExit={() => router.push(exitHref)}/>;
  if (phase === 'intro' || phase === 'preparing') return <div className="edu-n6">
    <header className="bar"><span className="brand"><Image src="/brandy-action-logo.png" alt="Brandy Action EDU" width={142} height={26}/></span><button className="exit-btn" onClick={() => router.push(exitHref)}>{exitLabel}</button></header>
    <main className="stage"><section className="panel intro-panel"><p className="panel-eyebrow">{adminPilot ? '관리자 전용 · 수강생에게 공개되지 않습니다' : 'N6 진단'}</p><h1 className="panel-title">나를 움직이는 마음을<br/>알아보는 시간</h1><p className="panel-sub">두 문장을 비교하며 지금의 나와 더 가까운 쪽을 고릅니다. 나의 이야기와 원하는 모습을 함께 담아 정밀 보고서를 준비합니다.</p>
      <p className="intro-chips"><span>약 20분</span><span>자동 저장</span><span>계정당 1회</span></p>
      {offers.length > 1 && <label className="course-choice">검사가 포함된 상품<select value={course} onChange={e => setCourse(e.target.value)}>{offers.map(o => <option key={o.courseId} value={o.courseId}>{o.title}</option>)}</select></label>}
      {phase === 'intro' && !offers.length ? <p className="panel-sub">현재 계정에 이용 가능한 N6 검사가 없습니다. 구매·수강 정보를 확인해 주세요.</p> : <><button className="cta-btn" onClick={() => void start()} disabled={pending}>{pending ? '검사 준비 중…' : phase === 'preparing' ? '검사 준비 다시 확인' : '검사 시작하기'}<ArrowRight size={18}/></button><p className="panel-note">제출 전까지 답변을 바꿀 수 있고, 중간에 나가도 이어서 진행할 수 있어요.</p></>}
      {error && <p role="alert">{error}</p>}
    </section></main></div>;
  return <div className="edu-diagnosis"><header className="diagnosis-header"><Image src="/brandy-action-logo.png" alt="Brandy Action EDU" width={164} height={30}/><button className="diagnosis-exit" onClick={() => router.push(exitHref)}><ArrowLeft size={16}/>{exitLabel}</button></header>
    <main className={`diagnosis-main${phase === 'submitted' && reportsEnabled ? ' diagnosis-report-main' : ''}`}>
      {phase === 'loading' && <div className="diagnosis-center" role="status"><LoaderCircle className="diagnosis-spin"/><p>검사를 불러오고 있어요.</p></div>}
      {phase === 'submitted' && reportsEnabled && <DiagnosisReportView onExit={() => router.push(exitHref)}/>}
      {phase === 'submitted' && !reportsEnabled && <section className="diagnosis-submitted"><span className="diagnosis-complete-icon"><CheckCircle2 size={32}/></span><h1>답변을 제출했어요.</h1>{session?.needsReview ? <p>답변은 안전하게 접수됐어요. 결과를 만들기 전 확인이 필요합니다.<br/>추가 결제나 재검사 없이 이곳에서 진행 상태를 확인해 주세요.</p> : <p>검사 결과가 준비되면 이곳에서 확인할 수 있어요.<br/>화면을 닫아도 괜찮고, 다시 제출하지 않아도 됩니다.</p>}<button className="diagnosis-primary" onClick={() => router.push(exitHref)}>{adminPilot ? '관리자 화면으로 돌아가기' : '학습으로 돌아가기'}<ArrowRight size={18}/></button></section>}
      {phase === 'error' && <div className="diagnosis-error" role="alert"><p>{error}</p><button className="diagnosis-secondary" onClick={() => void load()}>다시 불러오기</button></div>}
    </main></div>;
}
