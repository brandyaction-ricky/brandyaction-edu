'use client';
// MYIN client 86a259c: preserve its questionnaire markup/layout; use EDU's revision-safe APIs.
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createDiagnosisAutosave } from '@/lib/diagnosis-autosave';
import { diagnosisMissingQuestions, diagnosisQuestionAnswered, type DiagnosisAnswer as N30Answer, type DiagnosisQuestion as N30Question, type DiagnosisSession } from '@/lib/diagnosis-session';
import { DiagnosisRestart } from './diagnosis-restart';
import './diagnosis-questionnaire.css';

const present = (a?: N30Answer) => !!a && (!!a.optionId || !!a.values?.length || !!a.value?.trim());
const PAIR_SECONDS = 18, RING_C = 50.27;
const readClock = () => performance.now();
const PAIR_STEM = '두 문장 중 지금의 나에 더 가까운 쪽은?';
const PARTS = [{en:'PART 1',ko:'두 문장 비교'},{en:'PART 2',ko:'나의 이야기'},{en:'PART 3',ko:'원하는 나'}];
type Screen = {kind:'q';q:N30Question;no:number;of:number}|{kind:'intro'}|{kind:'essay'}|{kind:'aspire'};
function buildScreens(questions:N30Question[]):Screen[]{
  const core=questions.filter(q=>q.core || (q.type!=='text' && q.pickExactly===null));
  return [{kind:'intro'},...core.map((q,i)=>({kind:'q' as const,q,no:i+1,of:core.length})),
    ...(questions.some(q=>q.type==='text')?[{kind:'essay' as const}]:[]),
    ...(questions.some(q=>q.pickExactly!==null)?[{kind:'aspire' as const}]:[])];
}
const Back = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>;
const Tick = () => <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
type Props={initial:DiagnosisSession;save:(revision:number,answers:N30Answer[])=>Promise<{revision:number}>;submit:(revision:number)=>Promise<void>;onReload:()=>Promise<void>;onExit:()=>void;onRestart?:()=>Promise<void>};
export function DiagnosisQuestionnaire({initial,save,submit,onReload,onExit,onRestart}:Props){
  const questions=initial.survey.questions, screens=useMemo(()=>buildScreens(questions),[questions]);
  const parts=PARTS, completed=false;
  const [answers,setAnswers]=useState(initial.answers);
  const [page,setPage]=useState(()=>{
    if(!initial.answers.length)return 0;
    const missing=screens.findIndex(s=>s.kind==='q'&&!diagnosisQuestionAnswered(s.q,initial.answers.find(a=>a.questionId===s.q.id)));
    if(missing>=0)return missing;
    const aspire=questions.find(q=>q.pickExactly!==null);
    return initial.answers.some(a=>a.questionId===aspire?.id)?screens.length-1:Math.max(0,screens.findIndex(s=>s.kind==='essay'||s.kind==='aspire'));
  });
  const [busy,setBusy]=useState(false), [error,setError]=useState(''), [saveError,setSaveError]=useState('');
  const [saveStatus,setSaveStatus]=useState<'unsaved'|'saving'|'saved'|'error'>('saved');
  const [conflict,setConflict]=useState(false),[confirmReload,setConfirmReload]=useState(false),[confirmSubmit,setConfirmSubmit]=useState(false);
  const [confirmedInstructions,setConfirmedInstructions]=useState(false),[timerLeft,setTimerLeft]=useState(PAIR_SECONDS);
  const [checkMiss,setCheckMiss]=useState<string|null>(null);
  const latest=useRef(answers),alive=useRef(true),advancing=useRef(false),locked=useRef(false),shownAt=useRef(0);
  const advanceTimer=useRef<ReturnType<typeof setTimeout>|null>(null), dlgRef=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null),submitHeading=useRef<HTMLHeadingElement>(null);
  const saver=useRef<ReturnType<typeof createDiagnosisAutosave>|null>(null);
  useEffect(()=>{saver.current=createDiagnosisAutosave({revision:initial.revision,save,onState:(state,cause)=>{
    if(!alive.current)return;setSaveStatus(state);
    if(state==='saved')setSaveError('');
    if(state==='error'){
      setSaveError((cause instanceof Error?cause.message:'답변을 저장하지 못했습니다.')+' 입력한 답변은 이 화면에 남아 있습니다. 저장될 때까지 이 창을 닫지 마세요.');
      if((cause as {code?:string})?.code==='CONFLICT'){setConflict(true);if(advanceTimer.current)clearTimeout(advanceTimer.current);advancing.current=false;}
    }
  }});},[initial.revision,save]);
  const screen=screens[page],find=(q?:N30Question)=>answers.find(a=>a.questionId===q?.id);
  const coreTotal=questions.filter(q=>q.core).length,answered=questions.filter(q=>q.core&&diagnosisQuestionAnswered(q,find(q))).length;
  const textQuestions=questions.filter(q=>q.type==='text'),aspireQuestion=questions.find(q=>q.pickExactly!==null);
  const aspireValues=find(aspireQuestion)?.values??[],aspireTotal=aspireQuestion?.pickExactly??0;
  const dirty=saveStatus!=='saved',firstMissing=screens.findIndex(s=>s.kind==='q'&&!diagnosisQuestionAnswered(s.q,find(s.q)));
  useEffect(()=>{alive.current=true;const warn=(event:BeforeUnloadEvent)=>{if(saver.current?.dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>{alive.current=false;window.removeEventListener('beforeunload',warn);if(advanceTimer.current)clearTimeout(advanceTimer.current);};},[saver]);
  useEffect(()=>{if(!dirty||conflict||busy||saveStatus==='saving')return;const timer=setTimeout(()=>void saver.current!.flush().catch(()=>{}),saveStatus==='error'?5000:500);return()=>clearTimeout(timer);},[answers,dirty,conflict,busy,saveStatus,saver]);
  async function persist(){await saver.current!.flush();return saver.current!.revision;}
  function change(answer:N30Answer){const next=[...latest.current.filter(a=>a.questionId!==answer.questionId),answer];latest.current=next;setAnswers(next);setError('');saver.current!.update(next);}
  function navigateToPage(next:number){if(next<0||next>=screens.length)return;if(advanceTimer.current)clearTimeout(advanceTimer.current);advancing.current=false;setConfirmedInstructions(false);setCheckMiss(null);setConfirmSubmit(false);setPage(next);setTimerLeft(PAIR_SECONDS);setError('');window.scrollTo({top:0});}
  async function move(next:number,saveBefore=false,instructionsConfirmed=false){
    if(locked.current||conflict)return;
    if(next>page&&screen.kind==='q'){
      const a=latest.current.find(a=>a.questionId===screen.q.id);
      if(!diagnosisQuestionAnswered(screen.q,a)){setError('답을 선택해 주세요.');return;}
      if(screen.q.confirmationOptionId&&a?.optionId!==screen.q.confirmationOptionId&&!confirmedInstructions&&!instructionsConfirmed){setError('안내를 다시 읽고 확인 버튼을 눌러 주세요.');return;}
    }
    if(!saveBefore){navigateToPage(next);return;}
    locked.current=true;setBusy(true);try{await persist();if(alive.current)navigateToPage(next);}catch{/* Keep answers on this screen. */}finally{locked.current=false;if(alive.current)setBusy(false);}
  }
  function selectMulti(q:N30Question,optionId:string){const old=latest.current.find(a=>a.questionId===q.id)?.values??[];const values=old.includes(optionId)?old.filter(id=>id!==optionId):q.exclusiveOptionIds.includes(optionId)?[optionId]:[...old.filter(id=>!q.exclusiveOptionIds.includes(id)),optionId];if(q.pickExactly&&values.length>q.pickExactly)return;change({questionId:q.id,values});}
  function pick(q:N30Question,optionId:string){
    if(locked.current||conflict||advancing.current)return;
    if(q.requiredOptionId&&optionId!==q.requiredOptionId){setCheckMiss(q.id);return;}
    setCheckMiss(null);
    const ms=Math.round(readClock()-shownAt.current);
    change(q.pair?{questionId:q.id,optionId,ms:Math.min(600000,Math.max(0,ms))}:{questionId:q.id,optionId});
    if(q.confirmationOptionId&&optionId!==q.confirmationOptionId&&!confirmedInstructions)return;
    advancing.current=true;advanceTimer.current=setTimeout(()=>{advancing.current=false;if(alive.current)void move(page+1,screens[page+1]?.kind!=='q');},240);
  }
  useEffect(()=>{
    if(screen.kind!=='q'||screen.q.type==='multi_choice')return;
    const q=screen.q;const onKey=(event:KeyboardEvent)=>{if(event.repeat||event.metaKey||event.ctrlKey||event.altKey||locked.current)return;const target=event.target as HTMLElement;if(target.closest('input,textarea,select,[contenteditable=true]')||document.querySelector('dialog[open]'))return;const n=Number(event.key);if(!Number.isInteger(n)||n<1||n>q.options.length)return;event.preventDefault();pick(q,q.options[n-1].id);};
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
    // Event handlers read refs for the latest answer and saving lock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[page,conflict,confirmedInstructions]);
  useEffect(()=>{shownAt.current=performance.now();heading.current?.focus({preventScroll:true});},[page]);
  useEffect(()=>{if(confirmSubmit)submitHeading.current?.focus();},[confirmSubmit]);
  const pairScreen=screen.kind==='q'&&screen.q.type==='pair_choice'?screen.q:null;
  const pairAnswered=!!pairScreen&&present(find(pairScreen));
  useEffect(()=>{
    if(!pairScreen||pairAnswered)return;
    const started=Date.now();const timer=setInterval(()=>{const left=Math.max(0,PAIR_SECONDS-(Date.now()-started)/1000);setTimerLeft(left);if(left<=0)clearInterval(timer);},100);return()=>clearInterval(timer);
    // Changing screens or answering resets the nudge. Expiry never submits an answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[page,pairAnswered]);
  async function finish(){
    if(locked.current||conflict)return;
    const missing=diagnosisMissingQuestions(initial,latest.current);if(missing.length){const target=screens.findIndex(s=>s.kind==='q'&&s.q.id===missing[0].id);if(target>=0)navigateToPage(target);setError('아직 답하지 않은 문항이 있습니다.');return;}
    locked.current=true;setBusy(true);setError('');try{const revision=await persist();await submit(revision);}catch(cause){if(alive.current){setError(cause instanceof Error?cause.message:'제출 상태를 확인하지 못했습니다. 다시 시도해 주세요.');if((cause as {code?:string})?.code==='CONFLICT')setConflict(true);}}finally{locked.current=false;if(alive.current)setBusy(false);}
  }
  async function exit(){if(locked.current||conflict)return;dlgRef.current?.close();locked.current=true;setBusy(true);try{await persist();if(alive.current)onExit();}catch{/* Stay with unsaved answers. */}finally{locked.current=false;if(alive.current)setBusy(false);}}
  async function restart() {
    if (locked.current || conflict || !onRestart) throw Error('저장 상태를 확인한 뒤 다시 시도해 주세요.');
    locked.current = true; setBusy(true);
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    try { await persist(); await onRestart(); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  async function reloadSaved(){if(locked.current)return;locked.current=true;setBusy(true);try{await onReload();}catch(cause){setError(cause instanceof Error?cause.message:'저장된 답변을 불러오지 못했습니다.');}finally{locked.current=false;if(alive.current)setBusy(false);}}
  const cur=screen.kind==='q'||screen.kind==='intro'?0:screen.kind==='essay'?1:2;
  const q=screen.kind==='q'?screen.q:null,answer=find(q??undefined),multi=q?.type==='multi_choice',likert=q?.options.length===5&&!multi;
  const wrongInstruction=!!q?.confirmationOptionId&&!!answer?.optionId&&answer.optionId!==q.confirmationOptionId;
  const pct=coreTotal?Math.min(100,answered/coreTotal*100):0,aspireReady=aspireValues.length===aspireTotal;
  const prevButton=(label='이전 문항')=><button className="prev-btn" onClick={()=>void move(page-1)} disabled={page===0||busy}><Back/>{label}</button>;
  return <div className="edu-n6">
    <div className="thread" aria-hidden="true"><div className="thread-fill" style={{ width: pct.toFixed(2) + '%' }} /></div>
    <header className="bar">
      <span className="brand"><Image src="/brandy-action-logo.png" alt="Brandy Action EDU" width={142} height={26}/></span>
      <nav className="stepper" aria-label="문진 단계">
        {parts.map((p, i) => {
          const status = i < cur ? 'done' : i === cur ? 'current' : '';
          return <div key={p.en} className="stepwrap">
            <div className={'step ' + status}><span className="step-dot">{status === 'done' ? <Tick /> : i + 1}</span><span className="step-name">{p.ko}</span></div>
            {i < parts.length - 1 && <span className={'step-line' + (i < cur ? ' done' : '')} />}
          </div>;
        })}
      </nav>
      <div className="bar-right">
        <span className={'save-chip' + (completed ? '' : ' show')} aria-live="polite"><Tick /><span className="save-txt">{saveError ? '저장 확인 필요' : saveStatus === 'saving' ? '저장 중' : dirty ? '저장 대기' : '자동 저장됨'}</span><span>· 핵심 {answered}/{coreTotal}</span></span>
        <button className="exit-btn" onClick={() => dlgRef.current?.showModal()}>나가기</button>
      </div>
    </header>

    {onRestart && <aside className="diagnosis-admin-tools"><span>관리자 검수용{initial.adminTest ? ' · 빠른 응답 허용' : ''}</span><DiagnosisRestart disabled={busy || conflict} onRestart={restart}/></aside>}
    <main className="stage">
      {!completed && q && <div className="sheet">
          <div className="sheet-head">
            <span className="part-pill"><span className="en">{parts[cur]!.en}</span><span>{parts[cur]!.ko}</span></span>
            {screen.kind === 'q' && <span className="head-right">문항 <strong>{screen.no}</strong> / {screen.of}</span>}
          </div>
          <div className="sheet-body"><div className="qwrap" key={page}>
            <div className="q-index">
              <span className="q-no">Q {String(screen.kind === 'q' ? screen.no : 0).padStart(3, '0')}</span>
              <span className="q-guide">{multi ? '해당하는 것을 모두 골라 주세요' : q.pair ? '상황이 달라도 괜찮아요. 어느 쪽 마음이 지금의 나에 더 가까운지 바로 골라 주세요 · 숫자키 1~5' : likert ? '이 문장이 나와 얼마나 맞나요? 오래 고민하지 말고, 바로 떠오르는 대로 골라 주세요 · 숫자키 1~5' : q.options.length === 2 ? '둘 중 나와 더 가까운 쪽을 바로 골라 주세요 · 숫자키 1·2' : `숫자키 1~${q.options.length}`}</span>
            </div>
            <h1 className="q-text" ref={heading} tabIndex={-1}>{q.text}</h1>
            {q.type === 'pair_choice' && <div className="timer-row">
              <span className={'timer' + (timerLeft <= 5 && !present(answer) ? ' low' : '')}>
                <svg viewBox="0 0 20 20" fill="none" strokeWidth="2">
                  <circle className="ring-track" cx="10" cy="10" r="8" />
                  <circle className="ring-fill" cx="10" cy="10" r="8" strokeDasharray={RING_C} strokeDashoffset={(RING_C * (1 - timerLeft / PAIR_SECONDS)).toFixed(2)} strokeLinecap="round" />
                </svg>
                <span>{Math.ceil(timerLeft)}초</span>
              </span>
              {timerLeft <= 0 && !present(answer) && <span className="timer-hint">괜찮아요 — 먼저 떠오른 쪽으로 골라 주세요</span>}
            </div>}
            {q.pair && q.text !== PAIR_STEM && <div className="pair-check" role="note"><small>확인 문항</small>{q.text}</div>}
            {q.pair && <div className="pair-cards">
              <div className={'pair-card' + (answer?.optionId && q.options.findIndex(o => o.id === answer.optionId) < 2 ? ' lean' : '')}><small>왼쪽</small>{q.pair.left}</div>
              <span className="pair-vs" aria-hidden="true">VS</span>
              <div className={'pair-card' + (answer?.optionId && q.options.findIndex(o => o.id === answer.optionId) > 2 ? ' lean' : '')}><small>오른쪽</small>{q.pair.right}</div>
            </div>}
            <div className="options" style={q.pair ? { marginTop: 18 } : undefined}>
              <ul className={likert ? 'likert' + (q.pair ? ' pair-scale' : '') : 'binary'} role={multi ? 'group' : 'radiogroup'}>
                {q.options.map((option, i) => {
                  const on = multi ? !!answer?.values?.includes(option.id) : answer?.optionId === option.id;
                  return <li key={option.id}>
                    <button type="button" className={likert ? 'opt' : 'opt-b'} role={multi ? 'checkbox' : 'radio'} aria-checked={on} disabled={busy || conflict}
                      onClick={() => multi ? selectMulti(q, option.id) : pick(q, option.id)}>
                      <span className="num">{i + 1}</span><span className={likert ? 'lab' : ''}>{option.label}</span>
                    </button>
                  </li>;
                })}
              </ul>
            </div>
            {checkMiss===q.id && <div className="intro-note check-miss" role="alert"><span>안내와 다른 답을 골랐어요. 문항을 다시 읽고 안내된 답을 골라 주세요.</span></div>}
            {wrongInstruction && <div className="intro-note"><span>잘하는 정도나 실제 행동 횟수가 아니라, 나에게 얼마나 중요한 바람인지 답하는 문진입니다. 안내를 다시 확인해 주세요.</span>
              <button type="button" className="cta-btn" onClick={() => { setConfirmedInstructions(true); void move(page + 1, true, true); }}>안내를 읽었습니다</button></div>}
            {multi && <div className="cta-block"><button className="cta-btn" disabled={busy || conflict || !present(answer)} onClick={() => void move(page + 1, true)}>다음</button></div>}
          </div></div>
          <div className="sheet-foot">{prevButton()}<span className="foot-note">응답은 자동 저장돼요</span></div>
        </div>}

      {!completed && screen.kind === 'intro' && <div className="panel intro-panel">
        <p className="panel-eyebrow">시작하기 전에</p>
        <h1 className="panel-title" ref={heading} tabIndex={-1}>두 문장 중 <em>지금의 나</em>에<br />더 가까운 쪽을 고릅니다</h1>
        <p className="intro-chips"><span>약 20분</span><span>{coreTotal}문항</span><span>자동 저장</span></p>
        <ol className="intro-rules">
          <li><b>되고 싶은 나 말고, 지금의 나</b><span>정답은 없어요. 평소의 나를 떠올리며 골라 주세요.</span></li>
          <li><b>고민하지 말고, {PAIR_SECONDS}초 안에 바로 골라 주세요</b><span>문항마다 {PAIR_SECONDS}초 타이머가 돌아요.<br />직관적인 선택이 가장 정확해요.<br />시간이 지나도 넘어가지 않고, 고를 수 있어요.</span></li>
          <li><b>두 문장의 상황이 달라도 괜찮아요</b><span>어느 쪽 마음이 더 끌리는지만 보세요.</span></li>
        </ol>
        <details className="intro-why" open><summary>왜 두 문장의 상황이 다른가요?</summary>
          <ul className="intro-why-body">
            <li><b>강제 선택 비교 방식</b><span>상황이 아니라, 두 마음 중 더 큰 쪽만 비교해요.</span></li>
            <li><b>상황은 일부러 다르게</b><span>상황에 익숙한지가 답을 좌우하지 않도록요.</span></li>
            <li><b>같은 마음을 여러 번 비교</b><span>한두 문항이 애매해도 결과는 크게 달라지지 않아요.</span></li>
          </ul></details>
        <button className="cta-btn" onClick={() => void move(page + 1)} disabled={busy || conflict}>시작하기</button>
        <p className="panel-note choice-reminder"><strong>‘비슷하다’는 정말 고르기 어려울 때만 골라 주세요.</strong></p>
      </div>}

      {!completed && screen.kind === 'essay' && <div className="sheet">
        <div className="sheet-head">
          <span className="part-pill"><span className="en">PART 2</span><span>나의 이야기</span></span>
          <span className="head-right">서술 <strong>{textQuestions.length}</strong>문항 · 모두 선택</span>
        </div>
        <div className="sheet-body">
          <h1 className="view-title" ref={heading} tabIndex={-1}>이번엔, 직접 들려주세요</h1>
          <p className="view-sub">모두 선택 문항이에요. 적어 주시면 정밀 보고서가 <strong>지금 고민과 실제 장면</strong>에 맞춰 쓰여요. 떠오르는 장면 그대로 짧게 적어도 충분해요.</p>
          {textQuestions.map((q, i) => {
            const value = find(q)?.value ?? '';
            return <div className="field" key={q.id}>
              <label className="f-label" htmlFor={'es-' + q.id}><span className="f-no">Q{i + 1}</span><span className="f-q">{q.text.replace(/\s*\(선택\)\s*$/, '')}</span><span className="badge opt2">선택</span></label>
              <textarea id={'es-' + q.id} value={value} placeholder={q.placeholder} maxLength={10000} disabled={busy || conflict} onChange={e => change({ questionId: q.id, value: e.target.value })} />
              <div className="f-meta"><span /><span>{value.length}자</span></div>
            </div>;
          })}
          <div className="cta-block"><button className="cta-btn" onClick={() => void move(page + 1, true)} disabled={busy || conflict}>다음 단계로</button>
            <p className="cta-hint">작성한 내용은 자동 저장돼요</p></div>
        </div>
        <div className="sheet-foot">{prevButton()}<span className="foot-note">작성 중인 내용은 자동 저장돼요</span></div>
      </div>}

      {!completed && screen.kind === 'aspire' && aspireQuestion && <div className="sheet">
        <div className="sheet-head">
          <span className="part-pill"><span className="en">{parts.at(-1)!.en}</span><span>원하는 나</span></span>
          <span className="head-right"><strong>{aspireQuestion.options.length}</strong>개 중 <strong>{aspireTotal}</strong>개 선택</span>
        </div>
        <div className="sheet-body">
          <h1 className="view-title" ref={heading} tabIndex={-1}>{aspireQuestion.text}</h1>
          <p className="view-sub">지금의 내가 아니라 <strong>앞으로 챙기고 싶은 모습</strong> 기준으로 골라 주세요. {aspireTotal}개를 고르면 정밀 보고서의 ‘되고 싶은 나 vs 실제 나’에 쓰입니다.</p>
          <div className={'select-bar' + (aspireValues.length >= aspireTotal ? ' full' : '')} aria-live="polite">
            <span className="sb-label">원하는 나</span>
            <span className="sb-count"><span>{aspireValues.length}</span> <span className="max">/ {aspireTotal}</span></span>
          </div>
          <div className={'cards-area' + (aspireValues.length >= aspireTotal ? ' locked' : '')}><div className="cards-grid">
            {aspireQuestion.options.map(option => {
              const [title, ...rest] = option.label.split(' — ');
              const on = aspireValues.includes(option.id);
              return <button type="button" key={option.id} className="card-opt" role="checkbox" aria-checked={on} disabled={busy || conflict || (!on && aspireValues.length >= aspireTotal)} onClick={() => selectMulti(aspireQuestion, option.id)}>
                <span className="co-top"><span className="co-check"><Tick /></span><span className="co-title">{title}</span></span>
                {rest.length > 0 && <span className="co-power">{rest.join(' — ')}</span>}
              </button>;
            })}
          </div></div>
          <div className="cta-block">
            {answered === coreTotal
              ? <button className="cta-btn" onClick={() => setConfirmSubmit(true)} disabled={busy || conflict || !aspireReady}>{busy ? '처리 중…' : '문진 완료하기'}</button>
              : <button className="cta-btn" onClick={() => void move(firstMissing)} disabled={busy || conflict}>미응답 핵심 문항 {coreTotal - answered}개로 이동</button>}
            <p className="cta-hint">{aspireReady ? '제출 전까지 언제든 바꿀 수 있어요' : `${aspireTotal - aspireValues.length}개 더 골라 주세요`}</p>
          </div>
        </div>
        <div className="sheet-foot">{prevButton()}<span className="foot-note">제출 전까지 언제든 바꿀 수 있어요</span></div>
      </div>}

      {confirmSubmit && <div className="panel" role="region" aria-label="제출 전 확인"><h2 className="panel-title" ref={submitHeading} tabIndex={-1}>답변을 제출할까요?</h2><p className="panel-sub">제출하면 정밀 보고서 제작이 시작되고 답변을 바꿀 수 없습니다. 보고서와 MD 파일이 준비되면 이곳에서 받을 수 있어요.</p><button className="cta-btn" disabled={busy || conflict} onClick={() => void finish()}>{busy ? '제출 확인 중…' : '답변 제출하기'}</button><button className="prev-btn" disabled={busy} onClick={() => setConfirmSubmit(false)}>계속 수정하기</button></div>}
      {error && <p role="alert">{error}</p>}
      {saveError && <div role="alert" className="save-toast">{saveError}{!conflict && <button className="dlg-btn" onClick={() => void persist().catch(() => {})}>저장 다시 시도</button>}</div>}
      {conflict && <div className="panel"><p className="panel-sub">다른 창의 저장 내용과 충돌했습니다. 현재 입력은 이 화면에 남아 있습니다.</p>
        {!confirmReload ? <button className="cta-btn" disabled={busy} onClick={() => setConfirmReload(true)}>서버 응답 다시 불러오기</button>
          : <><p className="panel-sub">불러오면 이 창의 저장되지 않은 입력을 서버에 저장된 응답으로 바꿉니다.</p>
            <button className="cta-btn" disabled={busy} onClick={() => void reloadSaved()}>{busy ? '불러오는 중…' : '서버 응답으로 바꾸기'}</button>
            <button className="dlg-btn ghost" disabled={busy} onClick={() => setConfirmReload(false)}>취소</button></>}
      </div>}
    </main>

    <dialog ref={dlgRef}>
      <p className="dlg-title">문진을 잠시 멈출까요?</p>
      <p className="dlg-body">나가기를 누르면 지금까지의 응답을 저장합니다. 마이페이지에서 이어서 진행할 수 있어요.</p>
      <div className="dlg-actions">
        <button className="dlg-btn ghost" onClick={() => dlgRef.current?.close()}>계속하기</button>
        <button className="dlg-btn solid" disabled={busy || conflict} onClick={() => void exit()}>저장하고 나가기</button>
      </div>
    </dialog>
    
  </div>;
}
