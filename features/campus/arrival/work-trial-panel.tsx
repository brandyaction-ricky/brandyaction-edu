'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Copy, Download, FileText, ListChecks, Plus, RefreshCw} from 'lucide-react';
import {buildWorkManual, buildWorkPrompt, criteriaReady, DEFAULT_WORK_TRIAL, secondTaskReady, updateWorkTrial, workPromptCopyId, WORK_TRIAL_LIMITS, type WorkTrialConfig, type WorkTrialState} from './work-trial';
import s from './work-trial-panel.module.css';

const stages = ['업무 기준', '첫 업무', '피드백', '재사용'];

function RequestPicture({reusing}: {reusing: boolean}) {
  return <figure className={s.requestPicture} aria-label="업무 기준과 이번 자료를 합쳐 AI에게 보낼 전체 요청을 만듭니다">
    <div className={s.requestParts}>
      <div className={s.rulePaper}><ListChecks size={22}/><span>계속 사용할 기준</span><strong>내 업무 기준{reusing && <small>+ 반영한 피드백</small>}</strong><i/><i/></div>
      <Plus size={18} aria-hidden="true"/>
      <div className={s.taskPaper}><FileText size={22}/><span>이번에 바뀌는 내용</span><strong>이번 업무 자료</strong><i/><i/></div>
    </div>
    <figcaption><ArrowDown size={17}/><span>두 가지가 담긴 <strong>전체 요청문</strong>을 복사해요</span></figcaption>
  </figure>;
}

export function WorkTrialPanel({config, state, onChange, onExit, onLive, persistenceEnabled, storageBlocked = false}: {
  config: WorkTrialConfig;
  state: WorkTrialState;
  onChange: (state: WorkTrialState) => void;
  onExit: () => void;
  onLive: () => void;
  persistenceEnabled: boolean;
  storageBlocked?: boolean;
}) {
  const priorityName = useId();
  const [notice, setNotice] = useState('');
  const [manualCopied, setManualCopied] = useState('');
  const [manualNotice, setManualNotice] = useState('');
  const [copying, setCopying] = useState<'prompt' | 'manual' | null>(null);
  const [fallback, setFallback] = useState<{text: string; purpose: 'prompt' | 'manual'} | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const fallbackField = useRef<HTMLTextAreaElement>(null);
  const handoffHeading = useRef<HTMLHeadingElement>(null);
  const copyAttempt = useRef(0);
  const activeStage = Math.min(state.step, 3);
  const stageName = state.step === 1 ? 'first' : state.step === 2 ? 'feedback' : 'reuse';
  const prompt = state.step > 0 && state.step < 4 ? buildWorkPrompt(config, state, stageName) : '';
  const copyId = workPromptCopyId(prompt);
  const hasCopied = Boolean(copyId && state.copiedRequestId === copyId);
  const manual = buildWorkManual(config, state, {includeFeedback: state.step >= 2});
  const valueExplanation = config.valueExplanation ?? DEFAULT_WORK_TRIAL.valueExplanation;
  const stageContent = state.step === 0 ? config : state.step === 1 ? config.firstTask : state.step === 2 ? config.feedback : state.step === 3 ? config.secondTask : {title: config.summaryTitle, description: config.summaryDescription};

  useEffect(() => {
    scroll.current?.scrollTo({top: 0, behavior: 'instant'});
    heading.current?.focus({preventScroll: true});
  }, [state.step]);
  useEffect(() => {
    if (fallback) {fallbackField.current?.focus(); fallbackField.current?.select();}
  }, [fallback]);
  useEffect(() => {
    if (!hasCopied) return;
    scroll.current?.scrollTo({top: 0, behavior: 'instant'});
    handoffHeading.current?.focus({preventScroll: true});
  }, [hasCopied, state.step]);
  useEffect(() => () => {copyAttempt.current += 1;}, []);

  function patch(next: Partial<WorkTrialState>) {
    copyAttempt.current += 1;
    setCopying(null);
    onChange(updateWorkTrial(state, next));
    setNotice(''); setManualNotice(''); setFallback(null);
  }
  function go(step: WorkTrialState['step']) {
    patch({step});
  }
  function back() {
    if (state.step === 0) onExit();
    else go((state.step - 1) as WorkTrialState['step']);
  }
  async function copy(text: string, purpose: 'prompt' | 'manual' = 'prompt') {
    if (!text || copying) return;
    const attempt = ++copyAttempt.current;
    setCopying(purpose);
    try {
      await navigator.clipboard.writeText(text);
      if (attempt !== copyAttempt.current) return;
      setFallback(null);
      if (purpose === 'prompt') {onChange(updateWorkTrial(state, {copiedRequestId: copyId})); setNotice('');}
      else {setManualCopied(text); setManualNotice('복사했어요. 메모장에 보관한 뒤, 다음 업무 자료와 함께 AI에 보내세요.');}
    } catch {
      if (attempt !== copyAttempt.current) return;
      setFallback({text, purpose});
      if (purpose === 'manual') {setManualCopied(''); setManualNotice('브라우저에서 복사를 허용하지 않았어요. 바로 아래 내용을 직접 복사해 주세요.');}
      else setNotice('아래 내용을 전체 선택해 직접 복사해 주세요.');
    } finally {if (attempt === copyAttempt.current) setCopying(null);}
  }
  function download() {
    const url = URL.createObjectURL(new Blob([manual], {type: 'text/plain;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = '내-AI-직원-업무-매뉴얼.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setManualNotice('업무 매뉴얼 파일 내려받기를 시작했어요. 다음 업무 자료와 함께 사용하세요.');
  }
  function useSampleCriteria() {
    patch({role: config.roleDefault, reader: config.readerDefault, priority: config.priorities[0].id, boundary: config.boundaryDefault, format: config.formatDefault});
  }
  function confirmResponse() {
    if (!prompt) return;
    if (state.step === 1) patch({firstConfirmed: true, step: 2});
    else if (state.step === 2) patch({feedbackConfirmed: true, step: 3});
    else if (state.step === 3) patch({secondConfirmed: true, step: 4});
  }
  const firstReady = criteriaReady(config, state);
  const task = state.step === 1 ? config.firstTask : config.secondTask;
  const taskValue = state.step === 1 ? state.firstTask : state.secondTask;
  const manualRows = [
    {label: config.roleLabel, value: state.role},
    {label: config.readerLabel, value: state.reader},
    {label: '먼저 판단할 것', value: config.priorities.find(item => item.id === state.priority)?.rule ?? ''},
    {label: config.boundaryLabel, value: state.boundary.trim() || config.boundaryDefault},
    {label: config.formatLabel, value: state.format.trim() || config.formatDefault},
  ];

  function directCopy(purpose: 'prompt' | 'manual') {
    if (!fallback || fallback.purpose !== purpose) return null;
    return <div className={s.fallback}><label>{purpose === 'manual' ? '직접 복사할 업무 매뉴얼' : '직접 복사할 전체 요청문'}<textarea ref={fallbackField} rows={5} readOnly value={fallback.text}/></label><button type="button" className={s.secondary} onClick={() => {if (purpose === 'prompt' && fallback.text === prompt) patch({copiedRequestId: copyId}); else if (purpose === 'manual') {setManualCopied(fallback.text); setManualNotice('직접 복사한 매뉴얼을 메모장에 보관해 주세요.');} setFallback(null);}}>직접 복사했어요<Check size={15}/></button></div>;
  }

  return <div className={s.panel} data-work-step={state.step}>
    <div className={s.top}><span>내 AI 직원 · 회사 업무 체험</span><button type="button" onClick={back}><ArrowLeft size={15}/>이전</button></div>
    <ol className={s.progress} aria-label="회사 업무 체험 순서">{stages.map((label, index) => <li key={label} aria-current={index === activeStage ? 'step' : undefined} data-complete={index < activeStage}><span>{index < activeStage ? <Check size={13}/> : index + 1}</span>{label}</li>)}</ol>
    <div ref={scroll} className={s.body} id="arrival-content">
      {hasCopied && <div className={s.handoff}>
        <h2 ref={handoffHeading} tabIndex={-1}>요청문을 복사했어요</h2>
        <p>{state.step === 1 ? '평소 쓰는 AI에 붙여넣고 보내세요.' : '첫 업무를 맡긴 AI 대화에 이어서 보내세요.'}</p>
        <div className={s.aiLinks}><a href="https://chatgpt.com/" target="_blank" rel="noreferrer">ChatGPT 열기<ArrowUpRight size={15}/></a><a href={state.step === 1 ? "https://claude.ai/new" : "https://claude.ai/"} target="_blank" rel="noreferrer">Claude 열기<ArrowUpRight size={15}/></a></div>
        <p className={s.fine}>다른 AI에서도 쓸 수 있어요.</p>
      </div>}
      <header className={s.intro}><h1 ref={heading} tabIndex={-1}>{stageContent.title}</h1><p>{stageContent.description}</p></header>

      {state.step === 0 && <>
        <button type="button" className={s.exampleButton} onClick={useSampleCriteria}><FileText size={17}/>예시 업무로 시작<ArrowRight size={15}/></button>
        <div className={s.fields}>
          <label><span>{config.roleLabel}</span><textarea rows={2} maxLength={WORK_TRIAL_LIMITS.role} value={state.role} placeholder={config.roleDefault} onChange={event => patch({role: event.target.value})}/></label>
          <label><span>{config.readerLabel}</span><textarea rows={2} maxLength={WORK_TRIAL_LIMITS.reader} value={state.reader} placeholder={config.readerDefault} onChange={event => patch({reader: event.target.value})}/></label>
        </div>
        <fieldset className={s.priority}><legend>{config.priorityQuestion}</legend>{config.priorities.map(item => <label key={item.id} data-selected={state.priority === item.id}><input type="radio" name={priorityName} value={item.id} checked={state.priority === item.id} onChange={() => patch({priority: item.id})}/><span>{item.label}</span></label>)}</fieldset>
        <details className={s.disclosure}><summary>기본 업무 기준 확인·수정<ChevronDown size={16}/></summary><div className={s.fields}>
          <label><span>{config.boundaryLabel}</span><textarea rows={3} maxLength={WORK_TRIAL_LIMITS.rule} value={state.boundary} placeholder={config.boundaryDefault} onChange={event => patch({boundary: event.target.value})}/></label>
          <label><span>{config.formatLabel}</span><textarea rows={3} maxLength={WORK_TRIAL_LIMITS.rule} value={state.format} placeholder={config.formatDefault} onChange={event => patch({format: event.target.value})}/></label>
          <p className={s.fine}>비워두면 위 기본 기준을 적용합니다. 바꾸고 싶은 내용이 있다면 직접 적어주세요.</p>
        </div></details>
        <p className={s.fine}>실명·연락처·회사 기밀은 넣지 마세요. {persistenceEnabled ? '입력은 이 브라우저에만 보관됩니다.' : '관리자 미리보기의 입력은 저장되지 않습니다.'}</p>
      </>}

      {(state.step === 1 || state.step === 3) && <>
        <RequestPicture reusing={state.step === 3}/>
        <div className={s.taskHeading}><label htmlFor="work-trial-task">{task.label}</label><button type="button" className={s.textButton} onClick={() => patch(state.step === 1 ? {firstTask: task.sample} : {secondTask: task.sample})}>예시 메모 넣기</button></div>
        <textarea id="work-trial-task" className={s.taskInput} rows={5} maxLength={WORK_TRIAL_LIMITS.task} value={taskValue} onChange={event => patch(state.step === 1 ? {firstTask: event.target.value} : {secondTask: event.target.value})} placeholder={task.sample}/>
        <p className={s.fieldHint}>{task.hint}</p>
        {state.step === 3 && state.secondTask.trim() && !secondTaskReady(state) && <p className={s.fieldError} role="status">첫 업무와 다른 메모를 넣어주세요. 같은 기준이 새로운 업무에도 적용되는지 확인합니다.</p>}
        <details className={s.disclosure}><summary>AI에게 함께 보낼 업무 기준{state.step === 3 ? '·피드백' : ''}<ChevronDown size={16}/></summary><div className={s.manualRows}>{manualRows.map(item => <p key={item.label}><strong>{item.label}</strong>{item.value}</p>)}{state.step === 3 && <p><strong>이번 업무에도 적용할 피드백</strong>{state.feedback}</p>}</div></details>
      </>}

      {state.step === 2 && <>
        <p className={s.label}>다음 업무에서도 지켰으면 하는 기준</p>
        <div className={s.suggestions}>{config.feedback.suggestions.map((item, index) => <button key={index} type="button" aria-pressed={state.feedback === item} onClick={() => patch({feedback: item})}>{item}<span aria-hidden="true">{state.feedback === item ? <Check size={15}/> : '+'}</span></button>)}</div>
        <label className={s.feedbackLabel}><span>내 말로 수정하기</span><textarea rows={3} maxLength={WORK_TRIAL_LIMITS.feedback} value={state.feedback} onChange={event => patch({feedback: event.target.value})} placeholder={config.feedback.hint}/></label>
        {state.feedback.trim() && <div className={s.retainedRule}><span>업무 매뉴얼에 추가됩니다</span><p>{state.feedback}</p></div>}
      </>}

      {state.step > 0 && state.step < 4 && <>
        {prompt && <details className={s.disclosure}><summary>복사할 전체 요청문 미리보기<ChevronDown size={16}/></summary><div><p className={s.packageHint}>내 업무 기준{state.step > 1 ? '과 피드백' : ''}에 {state.step === 2 ? '첫 업무 자료' : '위에 입력한 자료'}를 합쳤어요. 아래 내용 전체가 복사됩니다.</p><textarea className={s.promptText} aria-label="개인 AI에게 보낼 요청문" readOnly value={prompt}/></div></details>}
        {!hasCopied && <p className={s.fine}>복사한 요청문은 평소 쓰는 AI에 붙여넣어 주세요. 답변은 그 AI에서 확인할 수 있어요.</p>}
        {prompt && !hasCopied && <button type="button" className={s.textButton} onClick={confirmResponse}>이미 답변을 받았어요<ArrowRight size={14}/></button>}
      </>}

      {state.step === 4 && <>
        <section className={s.valueExplanation} aria-label="업무 기준을 남기는 이유"><h2>{valueExplanation.title}</h2><div className={s.valueComparison}>
          <article><div className={s.paperSketch} aria-hidden="true"><FileText size={29}/><span/><span/><span/></div><h3>매번 처음부터 설명</h3><p>{valueExplanation.before}</p></article>
          <article><div className={`${s.paperSketch} ${s.reuseSketch}`} aria-hidden="true"><ListChecks size={29}/><RefreshCw size={22}/><FileText size={29}/></div><h3>내 기준에 새 자료만 추가</h3><p>{valueExplanation.after}</p></article>
        </div><p className={s.takeaway}>{valueExplanation.takeaway}</p></section>
        <article className={s.manual}><header><FileText size={20}/><div><h2>내 AI 직원의 업무 매뉴얼</h2><p>이번에 정한 기준과 피드백을 한곳에 모았어요</p></div></header><div className={s.manualPreview}><p><strong>맡길 일</strong>{state.role}</p><p><strong>다음에도 적용할 피드백</strong>{state.feedback}</p></div><div className={s.manualActions}><button type="button" className={s.secondary} data-copied={manualCopied === manual} disabled={copying === 'manual'} aria-busy={copying === 'manual'} onClick={() => copy(manual, 'manual')}>{manualCopied === manual ? <Check size={16}/> : <Copy size={16}/>}<span>{copying === 'manual' ? '복사 중…' : manualCopied === manual ? '매뉴얼 복사됨' : '매뉴얼 복사'}</span></button><button type="button" className={s.textButton} onClick={download}><Download size={16}/>파일로 받기</button></div><div className={s.manualFeedback} role="status" aria-live="polite">{manualNotice}</div>{directCopy('manual')}<details className={s.fullManual}><summary>업무 기준 전체 보기<ChevronDown size={16}/></summary><div className={s.manualRows}>{manualRows.map(item => <p key={item.label}><strong>{item.label}</strong>{item.value}</p>)}<p className={s.newRule}><strong>피드백으로 추가한 기준</strong>{state.feedback}</p></div></details></article>
        <p className={s.fine}>새 AI 대화에서는 이 매뉴얼과 새 업무 자료를 함께 보내주세요. 이번 체험이 AI의 영구 기억이나 자동 실행을 설정하지는 않습니다.</p>
        <details className={s.disclosure}><summary>두 번째 답변에서 기준이 지켜졌는지 확인하기<ChevronDown size={16}/></summary><div><fieldset className={s.checks}><legend>실제 답변을 보고 체크하세요</legend>{config.checks.map((item, index) => <label key={index}><input type="checkbox" checked={state.checks[index] ?? false} onChange={event => patch({checks: config.checks.map((_, current) => current === index ? event.target.checked : Boolean(state.checks[current]))})}/><span>{item}</span></label>)}</fieldset><button type="button" className={s.textButton} onClick={() => go(2)}>피드백을 보완하고 다시 해보기<ArrowRight size={14}/></button></div></details>
        <aside className={s.nextLearning}><span>이제, 내 자료로 일하는 AI 직원으로</span><p>{config.liveBridge}</p></aside>
      </>}

      {directCopy('prompt')}
      {notice && <p className={s.notice} role="status">{notice}</p>}
      {storageBlocked && <p className={s.fieldError} role="status">이 브라우저에서는 진행 내용을 보관할 수 없습니다. 화면을 닫기 전에 업무 매뉴얼을 복사해두세요.</p>}
    </div>
    <footer className={s.footer}>
      {state.step === 0 ? <><p>{firstReady ? '내 기준과 첫 업무를 함께 AI에 보냅니다.' : '맡길 일과 읽을 사람을 적고, 우선순위를 골라주세요.'}</p><button type="button" className={s.primary} disabled={!firstReady} onClick={() => go(1)}>이 기준으로 첫 업무 맡기기<ArrowRight size={17}/></button></> : state.step === 4 ? <button type="button" className={s.primary} onClick={onLive}>라이브에서 이어서 배우기<ArrowRight size={17}/></button> : <>
        <p>{hasCopied ? '답변을 받으면 이 화면으로 돌아오세요.' : state.step === 2 ? '수정할 기준을 담아 첫 답변을 다시 요청합니다.' : state.step === 3 ? '수정한 기준과 새 메모를 함께 보냅니다.' : '내 업무 기준과 메모가 하나의 요청문으로 준비됩니다.'}</p>
        <div className={s.footerActions}>{hasCopied ? <><button type="button" className={s.primary} onClick={confirmResponse}>{state.step === 1 ? '첫 답변을 받았어요' : state.step === 2 ? '수정한 답변을 확인했어요' : '두 번째 답변을 받았어요'}<Check size={17}/></button><button type="button" className={s.textButton} aria-label="요청문 다시 복사" onClick={() => copy(prompt)}><Copy size={16}/><span>다시 복사</span></button></> : <button type="button" className={s.primary} disabled={!prompt || copying === 'prompt'} aria-busy={copying === 'prompt'} onClick={() => copy(prompt)}><Copy size={17}/>{copying === 'prompt' ? '복사 중…' : state.step === 2 ? '피드백 반영 요청 복사' : '기준과 자료 함께 복사'}</button>}</div>
      </>}
    </footer>
  </div>;
}
