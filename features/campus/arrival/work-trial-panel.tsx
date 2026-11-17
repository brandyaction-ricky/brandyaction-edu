'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Copy, Download, FileText} from 'lucide-react';
import {buildWorkManual, buildWorkPrompt, criteriaReady, secondTaskReady, updateWorkTrial, WORK_TRIAL_LIMITS, type WorkTrialConfig, type WorkTrialState} from './work-trial';
import s from './work-trial-panel.module.css';

const stages = ['업무 기준', '첫 업무', '피드백', '재사용'];

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
  const [copied, setCopied] = useState('');
  const [fallback, setFallback] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const fallbackField = useRef<HTMLTextAreaElement>(null);
  const activeStage = Math.min(state.step, 3);
  const stageName = state.step === 1 ? 'first' : state.step === 2 ? 'feedback' : 'reuse';
  const prompt = state.step > 0 && state.step < 4 ? buildWorkPrompt(config, state, stageName) : '';
  const hasCopied = Boolean(prompt && copied === prompt);
  const manual = buildWorkManual(config, state, {includeFeedback: state.step >= 2});
  const stageContent = state.step === 0 ? config : state.step === 1 ? config.firstTask : state.step === 2 ? config.feedback : state.step === 3 ? config.secondTask : {title: config.summaryTitle, description: config.summaryDescription};

  useEffect(() => {
    scroll.current?.scrollTo({top: 0, behavior: 'instant'});
    heading.current?.focus({preventScroll: true});
  }, [state.step]);
  useEffect(() => {
    if (fallback) {fallbackField.current?.focus(); fallbackField.current?.select();}
  }, [fallback]);

  function patch(next: Partial<WorkTrialState>) {
    onChange(updateWorkTrial(state, next));
    setNotice(''); setFallback('');
  }
  function go(step: WorkTrialState['step']) {
    patch({step}); setCopied('');
  }
  function back() {
    if (state.step === 0) onExit();
    else go((state.step - 1) as WorkTrialState['step']);
  }
  async function copy(text: string, purpose: 'prompt' | 'manual' = 'prompt') {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setFallback('');
      if (purpose === 'prompt') setCopied(text);
      setNotice(purpose === 'manual' ? '업무 매뉴얼을 복사했습니다. 다음 업무를 맡길 때 다시 사용할 수 있어요.' : '복사했습니다. 개인 AI에 붙여넣고 전송한 뒤 이 화면으로 돌아오세요.');
    } catch {
      setFallback(text);
      setNotice('아래 내용을 전체 선택해 직접 복사해 주세요.');
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([manual], {type: 'text/plain;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = '내-AI-직원-업무-매뉴얼.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setNotice('업무 매뉴얼 파일 내려받기를 시작했습니다. 새 AI 대화에서는 이 매뉴얼을 함께 보내주세요.');
  }
  function useSampleCriteria() {
    patch({role: config.roleDefault, reader: config.readerDefault, priority: config.priorities[0].id, boundary: config.boundaryDefault, format: config.formatDefault});
  }
  function confirmResponse() {
    if (!prompt) return;
    if (state.step === 1) patch({firstConfirmed: true, step: 2});
    else if (state.step === 2) patch({feedbackConfirmed: true, step: 3});
    else if (state.step === 3) patch({secondConfirmed: true, step: 4});
    setCopied('');
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

  return <div className={s.panel} data-work-step={state.step}>
    <div className={s.top}><span>내 AI 직원 · 회사 업무 체험</span><button type="button" onClick={back}><ArrowLeft size={15}/>이전</button></div>
    <ol className={s.progress} aria-label="회사 업무 체험 순서">{stages.map((label, index) => <li key={label} aria-current={index === activeStage ? 'step' : undefined} data-complete={index < activeStage}><span>{index < activeStage ? <Check size={13}/> : index + 1}</span>{label}</li>)}</ol>
    <div ref={scroll} className={s.body} id="arrival-content">
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
        {state.step === 3 && <div className={s.retainedRule}><span>이번 업무에도 적용할 수정 기준</span><p>{state.feedback}</p></div>}
        <div className={s.taskHeading}><label htmlFor="work-trial-task">{task.label}</label><button type="button" className={s.textButton} onClick={() => patch(state.step === 1 ? {firstTask: task.sample} : {secondTask: task.sample})}>예시 메모 넣기</button></div>
        <textarea id="work-trial-task" className={s.taskInput} rows={5} maxLength={WORK_TRIAL_LIMITS.task} value={taskValue} onChange={event => patch(state.step === 1 ? {firstTask: event.target.value} : {secondTask: event.target.value})} placeholder={task.sample}/>
        <p className={s.fieldHint}>{task.hint}</p>
        {state.step === 3 && state.secondTask.trim() && !secondTaskReady(state) && <p className={s.fieldError} role="status">첫 업무와 다른 메모를 넣어주세요. 같은 기준이 새로운 업무에도 적용되는지 확인합니다.</p>}
        {state.step === 1 && <details className={s.disclosure}><summary>AI에게 함께 보낼 업무 기준<ChevronDown size={16}/></summary><div className={s.manualRows}>{manualRows.map(item => <p key={item.label}><strong>{item.label}</strong>{item.value}</p>)}</div></details>}
      </>}

      {state.step === 2 && <>
        <p className={s.label}>다음 업무에서도 지켰으면 하는 기준</p>
        <div className={s.suggestions}>{config.feedback.suggestions.map((item, index) => <button key={index} type="button" aria-pressed={state.feedback === item} onClick={() => patch({feedback: item})}>{item}<span aria-hidden="true">{state.feedback === item ? <Check size={15}/> : '+'}</span></button>)}</div>
        <label className={s.feedbackLabel}><span>내 말로 수정하기</span><textarea rows={3} maxLength={WORK_TRIAL_LIMITS.feedback} value={state.feedback} onChange={event => patch({feedback: event.target.value})} placeholder={config.feedback.hint}/></label>
        {state.feedback.trim() && <div className={s.retainedRule}><span>업무 매뉴얼에 추가됩니다</span><p>{state.feedback}</p></div>}
      </>}

      {state.step > 0 && state.step < 4 && <>
        {prompt && <details className={s.disclosure}><summary>{state.step === 2 ? '수정 기준과 요청문 확인' : '개인 AI에게 보낼 내용 확인'}<ChevronDown size={16}/></summary><div><textarea className={s.promptText} aria-label="개인 AI에게 보낼 요청문" readOnly value={prompt}/><button type="button" className={s.textButton} onClick={() => copy(prompt)}><Copy size={14}/>요청문 복사</button></div></details>}
        <div className={s.handoff}><h2>{hasCopied ? '개인 AI에 보내고 돌아오세요' : '개인 AI에서 실행합니다'}</h2><p>{state.step === 1 ? '요청문을 복사해 새 대화에 붙여넣으세요. 답변을 받으면 여기서 다음 단계를 이어갑니다.' : '첫 업무를 실행한 AI 대화에 이어서 보내세요. 업무 기준도 함께 담겨 있어 새 대화에서도 사용할 수 있습니다.'}</p><div className={s.aiLinks}><a href="https://chatgpt.com/" target="_blank" rel="noreferrer">ChatGPT<ArrowUpRight size={15}/></a><a href={state.step === 1 ? "https://claude.ai/new" : "https://claude.ai/"} target="_blank" rel="noreferrer">Claude<ArrowUpRight size={15}/></a></div><p className={s.fine}>캠퍼스는 개인 AI의 대화를 읽지 않습니다. 답변 확인은 직접 알려주세요.</p>{prompt && !hasCopied && <button type="button" className={s.textButton} onClick={confirmResponse}>이미 답변을 받았어요<ArrowRight size={14}/></button>}</div>
      </>}

      {state.step === 4 && <>
        <fieldset className={s.checks}><legend>두 번째 답변에서 직접 확인해보세요</legend>{config.checks.map((item, index) => <label key={index}><input type="checkbox" checked={state.checks[index] ?? false} onChange={event => patch({checks: config.checks.map((_, current) => current === index ? event.target.checked : Boolean(state.checks[current]))})}/><span>{item}</span></label>)}</fieldset>
        <p className={s.fine}>실제로 반영된 항목만 체크하세요. 부족한 부분은 기준을 더 구체적으로 고쳐 다시 맡겨볼 수 있습니다.</p>
        <button type="button" className={s.textButton} onClick={() => go(2)}>피드백을 보완하고 다시 해보기<ArrowRight size={14}/></button>
        <article className={s.manual}><header><FileText size={18}/><div><h2>내 AI 직원의 업무 매뉴얼</h2><p>다음 업무에도 사용할 기준</p></div></header><div className={s.manualRows}>{manualRows.map(item => <p key={item.label}><strong>{item.label}</strong>{item.value}</p>)}<p className={s.newRule}><strong>피드백으로 추가한 기준</strong>{state.feedback}</p></div><div className={s.manualActions}><button type="button" className={s.secondary} onClick={() => copy(manual, 'manual')}><Copy size={16}/>매뉴얼 복사</button><button type="button" className={s.textButton} onClick={download}><Download size={16}/>파일로 받기</button></div></article>
        <p className={s.fine}>새 AI 대화에서는 이 매뉴얼과 새 업무 자료를 함께 보내주세요. 이번 체험이 AI의 영구 기억이나 자동 실행을 설정하지는 않습니다.</p>
        <p className={s.liveBridge}>{config.liveBridge}</p>
      </>}

      {fallback && <div className={s.fallback}><label>직접 복사할 내용<textarea ref={fallbackField} rows={5} readOnly value={fallback}/></label><button type="button" className={s.secondary} onClick={() => {if (fallback === prompt) setCopied(prompt); setFallback(''); setNotice('직접 복사한 내용을 개인 AI에 보내주세요.');}}>직접 복사했어요<Check size={15}/></button></div>}
      {notice && <p className={s.notice} role="status">{notice}</p>}
      {storageBlocked && <p className={s.fieldError} role="status">이 브라우저에서는 진행 내용을 보관할 수 없습니다. 화면을 닫기 전에 업무 매뉴얼을 복사해두세요.</p>}
    </div>
    <footer className={s.footer}>
      {state.step === 0 ? <><p>{firstReady ? '내 기준과 첫 업무를 함께 AI에 보냅니다.' : '맡길 일과 읽을 사람을 적고, 우선순위를 골라주세요.'}</p><button type="button" className={s.primary} disabled={!firstReady} onClick={() => go(1)}>이 기준으로 첫 업무 맡기기<ArrowRight size={17}/></button></> : state.step === 4 ? <button type="button" className={s.primary} onClick={onLive}>라이브에서 이어서 배우기<ArrowRight size={17}/></button> : <>
        <p>{hasCopied ? 'AI에서 답변을 받은 뒤 아래 버튼을 눌러주세요.' : state.step === 2 ? '수정할 기준을 담아 첫 답변을 다시 요청합니다.' : state.step === 3 ? '수정한 기준과 새 메모를 함께 보냅니다.' : '내 업무 기준과 메모가 하나의 요청문으로 준비됩니다.'}</p>
        <div className={s.footerActions}>{hasCopied ? <><button type="button" className={s.primary} onClick={confirmResponse}>{state.step === 1 ? '첫 답변을 받았어요' : state.step === 2 ? '수정한 답변을 확인했어요' : '두 번째 답변을 받았어요'}<Check size={17}/></button><button type="button" className={s.textButton} aria-label="요청문 다시 복사" onClick={() => copy(prompt)}><Copy size={16}/><span>다시 복사</span></button></> : <button type="button" className={s.primary} disabled={!prompt} onClick={() => copy(prompt)}><Copy size={17}/>{state.step === 2 ? '수정 요청 복사하기' : state.step === 3 ? '두 번째 업무 요청 복사' : '첫 업무 요청 복사하기'}</button>}</div>
      </>}
    </footer>
  </div>;
}
