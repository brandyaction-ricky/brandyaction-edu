'use client';

import {useEffect, useEffectEvent, useRef, useState} from 'react';
import {ArrowUpRight, ArrowRight, ArrowLeft, Check, Copy, CalendarDays, BriefcaseBusiness, Compass, Lightbulb, RotateCcw, X, MoreHorizontal, ChevronDown, FileText} from 'lucide-react';
import {audiences, audienceContent, buildRevision, buildCriteria, revisionOptions, requestReady, type Audience, type Answers, ANSWER_LIMIT} from './content';
import {initialArrivalState, parseArrivalState, serializeArrivalState, ARRIVAL_STORAGE_KEY, googleCalendarUrl, calendarIcs, arrivalBackStep, isPersonalTrialStep, type ArrivalState, type ArrivalStep, type CorridorStation} from './model';
import {CorridorScene} from './corridor-scene';
import {HallProgram} from './hall-program';
import {CorridorPanel} from './corridor-panel';
import entryStyle from './office-entry.module.css';
import {WorkTrialPanel} from './work-trial-panel';
import {VisitorAvatar} from './visitor-avatar';
import {DEFAULT_WORK_TRIAL} from './work-trial';
import s from './experience.module.css';
import theme from '../ui/theme.module.css';
import {DEFAULT_ARRIVAL, buildManagedRequest, arrivalLiveEvent, type ArrivalConfig} from './config';

const icons = {work: FileText, business: BriefcaseBusiness, preparing: Compass, exploring: Lightbulb};
const destinations = ['팀장 봇', '조사 직원', '기획·제작 직원', '고객 응대 직원', '회사 기준 보관함', '내 AI 체험', '라이브 홀'] as const;
const invitations = ['팀장 만나기', '조사 직원 만나기', '제작 직원 만나기', '응대 직원 만나기', '회사 기준 보러 가기', '체험 직원 만나기', '라이브 홀로 가기'] as const;

/** Optional [section] lines keep editable examples readable; other text stays literal. */
function ResultExample({text}: {text: string}) {
  return <div className={s.resultSections}>{text.split(/\n\s*\n/).filter(Boolean).map((block, index) => {
    const section = block.match(/^\[([^\]\n]{1,60})\]\n([\s\S]*)$/);
    return section ? <section key={index}><h3>{section[1]}</h3><p>{section[2]}</p></section> : <p key={index}>{block}</p>;
  })}</div>;
}

export function ArrivalExperience({config = DEFAULT_ARRIVAL, persistenceKey = ARRIVAL_STORAGE_KEY, preview = false, embedded = false}: {config?: ArrivalConfig; persistenceKey?: string | null; preview?: boolean; embedded?: boolean}) {
  const [state, setState] = useState<ArrivalState>(initialArrivalState);
  const [hydrated, setHydrated] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [notice, setNotice] = useState('');
  const [copyFallback, setCopyFallback] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [sceneStatus, setSceneStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [walkRequest, setWalkRequest] = useState(0);
  const [walkAssist, setWalkAssist] = useState<'idle' | 'moving' | 'open'>('idle');
  const [sceneVisit, setSceneVisit] = useState(0);
  const [explore, setExplore] = useState(false);
  const [deskOpen, setDeskOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const deskDialog = useRef<HTMLDialogElement>(null);
  const introDialog = useRef<HTMLDialogElement>(null);
  const deskButton = useRef<HTMLButtonElement>(null);
  const resetDialog = useRef<HTMLDialogElement>(null);
  const exampleDialog = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const walkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const visited = useRef(false);
  const step = state.step;
  const officeIntro = step === 0;
  const canOpenStation = sceneStatus === 'unavailable' || walkAssist === 'open';
  const station = state.station;
  const destination = destinations[station - 1];
  const workConfig = config.workTrial ?? DEFAULT_WORK_TRIAL;
  const workActive = state.audience === 'work' && ![0, 7, 8].includes(step);
  const room = step === 7 ? 'live' : 'office';
  const content = {...audienceContent[state.audience], ...config.audiences[state.audience]};
  const answers = state.answers[state.audience];
  const effectiveAnswers = state.mode === 'example' ? content.example : answers;
  const prompt = buildManagedRequest(config, state.audience, effectiveAnswers);
  const revision = buildRevision(state.audience, state.revision, state.extra);
  const criteria = buildCriteria(state.audience, effectiveAnswers, state.revision, {mode: state.mode, extra: state.extra}).map(item => item.label === '맡길 일' ? {...item, value: content.goal} : item);
  const event = arrivalLiveEvent(config);
  const calendarLink = googleCalendarUrl(event);
  const date = new Date(config.startsAt);
  const dateLabel = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',month:'long',day:'numeric'}).format(date);
  const timeLabel = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit',hour12:true}).format(date).replace(/:(\d{2})$/, (_, minutes: string) => minutes === '00' ? '시' : `시 ${Number(minutes)}분`);
  const dateNumber = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit'}).format(date).replace('/', '.');
  const weekday = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',weekday:'long'}).format(date);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {setState(persistenceKey ? parseArrivalState(localStorage.getItem(persistenceKey)) : initialArrivalState());}
      catch {setStorageBlocked(true);}
      setHydrated(true);
    });
    return () => {active = false;};
  }, [persistenceKey]);
  useEffect(() => {
    if (!hydrated || !persistenceKey) return;
    try {localStorage.setItem(persistenceKey, serializeArrivalState(state));}
    catch {queueMicrotask(() => setStorageBlocked(true));}
  }, [state, hydrated, persistenceKey]);
  useEffect(() => {
    if (!hydrated || !visited.current) {visited.current = hydrated; return;}
    // Only an intentional scene change moves focus. Typing/copying never jumps the page.
    scrollArea.current?.scrollTo({top: 0, behavior: 'instant'});
    heading.current?.focus({preventScroll: true});
  }, [step, hydrated]);
  useEffect(() => {
    if (showReset) resetDialog.current?.showModal();
    else resetDialog.current?.close();
  }, [showReset]);
  useEffect(() => {
    if (showExample) exampleDialog.current?.showModal();
    else exampleDialog.current?.close();
  }, [showExample]);
  useEffect(() => {
    if (copyFallback) {fallbackRef.current?.focus(); fallbackRef.current?.select();}
  }, [copyFallback]);

  useEffect(() => {
    if (deskOpen) deskDialog.current?.showModal();
    else deskDialog.current?.close();
  }, [deskOpen]);
  useEffect(() => {
    if (introOpen) introDialog.current?.showModal();
    else introDialog.current?.close();
  }, [introOpen]);
  useEffect(() => () => clearTimeout(walkTimer.current), []);

  const onCorridorKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat || event.key !== ' ' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const next = deskButton.current;
    if (!officeIntro || deskOpen || introOpen || avatarOpen || showReset || menu.current?.open || !next || next.disabled) return;
    if (event.target instanceof HTMLElement && event.target.closest('button, a, input, textarea, select, summary, [contenteditable="true"]')) return;
    event.preventDefault();
    next.click();
  });
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => onCorridorKey(event);
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  function arrive(at: CorridorStation) {
    if (at !== station || step !== 0) return;
    resetWalkAssist();
    if (at === 7) go(7);
    else if (at === 6) go(8);
    else setDeskOpen(true);
  }
  function finishStation() {
    if (station >= 6) return;
    closeDesk();
    update({station: (station + 1) as CorridorStation});
  }
  function headToHall() {
    go(0, {station: 7, hallReturnStep: isPersonalTrialStep(step) ? step : 8});
  }
  function walkToStation() {
    if (canOpenStation) arrive(station);
    else if (sceneStatus === 'ready') {
      clearTimeout(walkTimer.current);
      setWalkRequest(value => value + 1);
      setWalkAssist('moving');
      walkTimer.current = setTimeout(() => setWalkAssist('open'), 4800);
    }
  }
  function resetWalkAssist() {
    clearTimeout(walkTimer.current);
    setWalkAssist('idle');
  }
  function closeDesk() {
    deskDialog.current?.close();
    setDeskOpen(false);
    deskButton.current?.focus();
  }

  function update(patch: Partial<ArrivalState>) {setState(value => ({...value, ...patch}));}
  function go(next: ArrivalStep, route: Pick<Partial<ArrivalState>, 'station' | 'hallReturnStep'> = {}) {
    resetWalkAssist();
    setDeskOpen(false);
    setIntroOpen(false);
    if (menu.current) menu.current.open = false;
    setNotice('');
    setCopyFallback('');
    setExplore(false);
    update({...route, step: next});
  }
  function selectAudience(audience: Audience) {
    update({audience, mode: 'personal', experience: 'none', handoff: 'ready', extra: '', step: 1});
    setNotice(''); setCopyFallback('');
  }
  function answer(field: keyof Answers, value: string) {
    setState(previous => ({...previous, experience: 'none', handoff: 'ready', answers: {...previous.answers, [previous.audience]: {...previous.answers[previous.audience], [field]: value}}}));
  }
  async function copy(text: string, handoff = false) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyFallback('');
      if (handoff) update({handoff: 'copied'});
      setNotice(handoff ? '복사했어요. 평소 쓰는 AI를 열어 붙여넣어 주세요.' : '복사했어요. 같은 AI 대화에 이어서 보내주세요.');
    } catch {
      setCopyFallback(text);
      setNotice('아래 글을 전체 선택해 직접 복사해 주세요.');
    }
  }
  function saveCalendar() {
    const text = calendarIcs(event);
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], {type: 'text/calendar;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = `moonshot-live-${event.date.replaceAll('-', '')}.ics`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setNotice('일정 파일을 열고 캘린더에서 ‘추가’를 눌러주세요. 카톡 안에서 열리지 않으면 Safari로 열어주세요.');
  }
  function reset() {
    if (menu.current) menu.current.open = false;
    try {if (persistenceKey) localStorage.removeItem(persistenceKey);} catch {}
    resetWalkAssist();
    setSceneVisit(value => value + 1); setSceneStatus('loading'); setWalkRequest(0);
    setState({...initialArrivalState(), visitorAvatar: state.visitorAvatar}); setDeskOpen(false); setIntroOpen(false); setCopyFallback(''); setExplore(false); setShowReset(false); setNotice('');
  }
  function exampleFinish() {update({mode: 'example', experience: 'example-viewed', handoff: 'ready', step: 5}); setNotice('');}
  function personalStart() {update({mode: 'personal', experience: 'none', step: 2}); setNotice('');}
  const title = (text: React.ReactNode, description?: string) => <div className={s.intro}><h1 ref={heading} tabIndex={-1}>{text}</h1>{description && <p>{description}</p>}</div>;

  return <main className={`${theme.surface} ${s.root} ${embedded ? s.embedded : ''}`} data-room={room} data-office-entry={officeIntro || undefined}>
    <a href={officeIntro ? '#arrival-desk-button' : '#arrival-content'} className={s.skip}>체험 안내로 바로가기</a>
    <div className={s.world} aria-label="웰컴존에서 라이브 홀까지 이어지는 통로">
      {hydrated && <CorridorScene key={sceneVisit} station={station} label={station === 3 ? config.officeDemo?.deskLabel : undefined}
        avatar={state.visitorAvatar}
        paused={deskOpen || introOpen || avatarOpen || showReset || (!officeIntro && !explore)}
        freeRoam={step === 7 && explore}
        walkRequest={walkRequest} onArrive={arrive} onStatus={setSceneStatus} className={s.scene}/>}
    </div>
    <header className={s.header}>
      <div className={s.wordmark}>{/* eslint-disable-next-line @next/next/no-img-element -- Reuse the existing EDU brand asset. */}
      <img src="/brandy-action-logo.png" alt="브랜디액션"/><small>EDU</small></div>
      <div className={entryStyle.progress} aria-live="polite" aria-atomic="true"><span>문샷 웰컴존</span><i aria-hidden="true"/><b>{station === 7 ? 'LIVE' : String(station).padStart(2, '0') + ' / 06'}</b><strong>{destination}</strong></div>
      <details ref={menu} className={s.menu}><summary aria-label="체험 메뉴"><MoreHorizontal size={23}/></summary><div><span>{preview ? '저장 전 관리자 미리보기' : '브랜치 미리보기'}</span><button type="button" onClick={() => {if (menu.current) menu.current.open = false; setIntroOpen(true);}}>체험 소개</button>{!officeIntro && step !== 7 && <button type="button" onClick={headToHall}><CalendarDays size={16}/>라이브 홀로 이동</button>}<button type="button" onClick={() => persistenceKey ? setShowReset(true) : reset()}><RotateCcw size={16}/>처음부터 보기</button></div></details>
    </header>
    {officeIntro && station === 1 && sceneStatus === 'ready' && <div className={entryStyle.avatarControl}>
      <VisitorAvatar value={state.visitorAvatar} onChange={visitorAvatar => update({visitorAvatar})} onOpenChange={setAvatarOpen} persistent={Boolean(persistenceKey) && !storageBlocked}/>
    </div>}
    {officeIntro ? <section className={entryStyle.wayfinding} aria-label="현재 목적지" data-walk-station={station}>
      <div>
        <span>다음 목적지</span>
        <h1>{destination}</h1>
        {canOpenStation ? <p>버튼으로 이곳의 내용을 바로 열 수 있어요.</p> : <>
          <p className={entryStyle.keyboardHint}>스페이스바를 누르면 화살표 쪽으로 걸어가요.</p>
          <p className={entryStyle.touchHint}>화살표 쪽 바닥을 터치하거나 옆 버튼을 누르세요.</p>
          {station === 1 && <p>팀장 안내를 마치면 다음 장소가 열려요.</p>}
        </>}
      </div>
      <button id="arrival-desk-button" type="button" ref={deskButton} onClick={walkToStation} disabled={sceneStatus === 'loading' || (!canOpenStation && walkAssist === 'moving')}>
        {sceneStatus === 'loading' ? '공간 준비 중' : canOpenStation ? '내용 열기' : walkAssist === 'moving' ? '이동 중' : invitations[station - 1]}<ArrowRight size={16}/>
      </button>
    </section> : <section className={`${s.dock} ${workActive ? s.workDock : ''} ${explore ? s.dockHidden : ''}`} aria-label="캠퍼스 체험 안내">
      {workActive ? <WorkTrialPanel config={workConfig} state={state.workTrial} persistenceEnabled={Boolean(persistenceKey)} storageBlocked={storageBlocked}
        onChange={workTrial => update({workTrial, experience: workTrial.secondConfirmed ? 'self-reported' : 'none'})}
        onExit={() => go(8)} onLive={headToHall}/> : <>
      <div className={s.dockTop}><span>{step === 8 ? '내 상황에 맞는 체험' : step === 7 ? '무료 라이브 일정' : config.audiences[state.audience].label}</span><button type="button" className={s.back} onClick={() => go(arrivalBackStep(state), step === 7 ? {station: 6} : {})}><ArrowLeft size={14}/>{step === 7 ? '내 AI 체험으로 돌아가기' : '이전'}</button></div>
      <div ref={scrollArea} className={s.scrollArea} id="arrival-content" key={step}>
        {step === 8 && <>
          {title(<>지금 어떤 상황이신가요?</>, '가장 가까운 상황을 골라주세요. 나에게 맞는 결과 예시부터 보여드릴게요.')}
          <div className={s.choices} aria-label="내 상황에 맞는 체험 선택">{audiences.filter(id => id !== 'work').map(id => {const Icon = icons[id]; return <button type="button" key={id} onClick={() => selectAudience(id)}><span className={s.choiceIcon}><Icon size={21}/></span><span><strong>{config.audiences[id].label}</strong><small>{config.audiences[id].goal}</small></span><ArrowRight size={17}/></button>;})}</div>
          <button type="button" className={s.textButton} onClick={() => selectAudience('work')}><FileText size={16}/>{config.audiences.work.label}<ArrowRight size={15}/></button>
          <div className={s.liveTeaser}><p>{dateLabel} {timeLabel} · 무료 라이브</p><strong>{config.liveTitle}</strong><button type="button" className={s.textButton} onClick={headToHall}>라이브 홀로 이동<ArrowRight size={16}/></button></div>
        </>}
        {step === 1 && <>
          {title(config.audiences[state.audience].goal)}
          <article className={s.resultPaper}><div className={s.paperTop}><FileText size={16}/><span>이렇게 정리할 수 있습니다</span><small>체험용 예시</small></div><ResultExample text={content.example.before}/></article>
          <details className={s.disclosure}><summary>AI에게 알려준 내용 보기<ChevronDown size={16}/></summary><div><p><strong>{state.audience === 'work' ? '정리할 업무 메모' : state.audience === 'exploring' ? '겪은 일' : '상품과 고객'}</strong>{content.example.a}</p><p><strong>{state.audience === 'work' ? '읽을 사람과 보고 목적' : state.audience === 'business' ? '알려줄 장점' : state.audience === 'preparing' ? '궁금한 점' : '사람과 상황'}</strong>{content.example.b}</p></div></details>
          <p className={s.insight}><strong>누구를 위한 결과인지, 무엇을 담아야 하는지.</strong> 내 상황을 알려주면 AI가 답변을 만들 때 참고할 수 있습니다.</p>
          <button className={s.textButton} type="button" onClick={exampleFinish}>입력 없이 예시로 계속하기</button>
        </>}
        {step === 2 && <>
          {title(<>내 상황을 알려주세요.</>, '두 가지 답변을 바탕으로 AI에게 보낼 요청문을 만들어드립니다.')}
          <form id="arrival-brief" className={s.questions} onSubmit={event => {event.preventDefault(); if (requestReady(answers)) {update({mode: 'personal', experience: 'none', handoff: 'ready', step: 3}); setNotice('');}}}>
            <label><span><b>1</b>{content.q1}</span><textarea rows={2} maxLength={ANSWER_LIMIT} value={answers.a} onChange={e => answer('a', e.target.value)} placeholder={`예: ${content.example.a}`} required/><small>{content.hint1}</small></label>
            <label><span><b>2</b>{content.q2}</span><textarea rows={2} maxLength={ANSWER_LIMIT} value={answers.b} onChange={e => answer('b', e.target.value)} placeholder={`예: ${content.example.b}`} required/><small>{content.hint2}</small></label>
          </form>
          <p className={s.fine}>이름·연락처·회사 기밀은 적지 마세요.<br/>{persistenceKey ? '적은 내용은 이 브라우저에만 저장돼요.' : '미리보기 입력은 저장하지 않아요. 닫으면 사라져요.'}</p>
        </>}
        {step === 3 && <>
          {title(state.handoff === 'copied' ? <>이제 내 AI에<br/><em>붙여넣어 주세요.</em></> : <>AI에게 보낼 요청문이<br/><em>준비됐습니다.</em></>)}
          {!prompt ? <div className={s.recovery}><p>내 상황 두 가지를 먼저 알려주세요.</p><button type="button" className={s.primary} onClick={() => go(2)}>내 상황 입력하기<ArrowRight size={18}/></button></div> : <>
            <div className={s.handoffSteps}>
              <div className={s.handoffStep}><span className={state.handoff === 'copied' ? s.checked : ''}>{state.handoff === 'copied' ? <Check size={15}/> : '1'}</span><div><strong>요청문 복사하기</strong><p>입력한 내용과 원하는 결과를 담았습니다.</p><details className={s.promptDetails}><summary>요청문 펼쳐보기<ChevronDown size={14}/></summary><textarea aria-label="AI에게 보낼 요청문" readOnly value={prompt}/></details>{state.handoff === 'copied' && <button type="button" className={s.textButton} onClick={() => copy(prompt, true)}><Copy size={14}/>다시 복사</button>}</div></div>
              <div className={s.handoffStep}><span>2</span><div><strong>평소 쓰는 AI에 붙여넣기</strong><p>새 대화에 붙여넣고 전송해 주세요.</p><div className={s.aiLinks}><a href="https://chatgpt.com/" target="_blank" rel="noreferrer">ChatGPT 열기<ArrowUpRight size={15}/></a><a href="https://claude.ai/new" target="_blank" rel="noreferrer">Claude 열기<ArrowUpRight size={15}/></a></div><small>다른 AI를 써도 괜찮아요.</small></div></div>
              <div className={s.handoffStep}><span>3</span><div><strong>답변을 받으면 이곳으로 돌아오기</strong><p>{persistenceKey ? '이 화면과 입력한 내용은 그대로 남아 있어요.' : '이 미리보기를 닫지 않고 돌아오면 계속할 수 있어요.'}</p></div></div>
            </div>
            <p className={s.fine}>캠퍼스는 개인 AI의 답변을 읽지 않아요.</p>
          </>}
        </>}
        {step === 5 && <>
          <span className={s.achievement}><Check size={15}/>{state.experience === 'example-viewed' ? '체험 예시 확인' : state.experience === 'self-reported' ? '개인 AI 답변 확인' : '요청문 준비 완료'}</span>
          {title(<>매번 같은 설명을<br/><em>반복하지 않으려면?</em></>, '자주 쓰는 자료와 원하는 결과의 기준을 정리해두세요. AI 직원이 일을 할 때 참고할 업무 매뉴얼이 됩니다.')}
          {state.mode === 'example' ? <details className={s.disclosure}><summary>수정 요청과 결과 예시 보기<ChevronDown size={16}/></summary><div><span className={s.miniLabel}>이렇게 부탁했어요</span><p>“{content.example.revision}”</p><span className={s.miniLabel}>다듬은 결과 · 체험용 예시</span><ResultExample text={content.example.after}/></div></details> : <details className={s.disclosure}><summary>답변을 한 번 더 다듬고 싶어요<ChevronDown size={16}/></summary><div><p>아쉬운 점을 골라 같은 AI 대화에 이어서 보내세요.</p><div className={s.revisionChoices}>{revisionOptions.map(option => <button type="button" key={option.id} aria-pressed={state.revision === option.id} onClick={() => update({revision: option.id})}>{option.label}</button>)}</div>{state.revision === 'different' && <label className={s.extraLabel}>어떤 부분이 달랐나요?<textarea rows={2} maxLength={300} value={state.extra} onChange={e => update({extra: e.target.value})} placeholder="예: 선생님이 아니라 학부모에게 보내는 글이에요."/></label>}<p className={s.resultText}>{revision}</p><button type="button" className={s.secondary} disabled={!revision} onClick={() => copy(revision)}><Copy size={15}/>수정 요청 복사</button></div></details>}
          <details className={s.disclosure}><summary>{state.mode === 'example' ? '예시에서 AI에게 알려준 내용' : 'AI에게 알려준 내용 보기'}<ChevronDown size={16}/></summary><div className={s.criteria}>{criteria.slice(0,3).map(item => <p key={item.label}><strong>{item.label}</strong>{item.value}</p>)}<button className={s.textButton} type="button" onClick={() => copy(criteria.slice(0,3).map(x => `${x.label}: ${x.value}`).join('\n'))}><Copy size={14}/>기준 복사하기</button></div></details>
          <p className={s.insight}>{content.bridge}<br/><strong>{dateLabel} 라이브에서 방법을 알려드립니다.</strong></p>
          {state.mode === 'example' && <button type="button" className={s.textButton} onClick={personalStart}>내 상황으로 직접 해보기<ArrowRight size={14}/></button>}
        </>}
        {step === 7 && <>
          {title(config.liveTitle)}
          <div className={s.ticket}><div className={s.ticketHead}><span>MOONSHOT LIVE</span><span>무료 라이브</span></div><div className={s.ticketDate}><strong>{dateNumber}</strong><div>{weekday}<b>{timeLabel}</b><small>한국 시간</small></div></div><div className={s.ticketFoot}>{config.instructorName}</div></div>
          <p className={s.calendarIntro}>라이브 일정을 캘린더에 저장하세요.<br/><strong>{config.liveUrl ? '저장한 일정에서도 라이브 링크를 확인할 수 있어요.' : '유튜브 링크는 카톡방에서 안내해드려요.'}</strong></p>
          <details className={s.disclosure}><summary>라이브에서 배우는 내용<ChevronDown size={16}/></summary><div><p>{state.audience === 'work' ? workConfig.liveBridge : content.bridge}</p><p>{config.instructorIntro}</p>{config.videoUrl && <a className={s.textButton} href={config.videoUrl} target="_blank" rel="noreferrer">강사·강의 소개 영상 보기<ArrowUpRight size={16}/></a>}</div></details>
          <HallProgram config={config}/>
          {config.liveUrl && <a className={s.textButton} href={config.liveUrl} target="_blank" rel="noreferrer">라이브 참여 링크<ArrowUpRight size={16}/></a>}<p className={s.fine}>{!config.endsAt && '종료 시각은 안내 예정이에요. 지금은 시작 시각을 저장합니다. '}캘린더 화면에서 마지막 ‘저장’ 또는 ‘추가’를 눌러주세요.</p>
        </>}
        {copyFallback && <div className={s.copyFallback}><label>직접 복사할 요청문<textarea ref={fallbackRef} readOnly value={copyFallback}/></label>{step === 3 && <button type="button" className={s.secondary} onClick={() => {update({handoff: 'copied'}); setCopyFallback(''); setNotice('이제 평소 쓰는 AI에 붙여넣어 주세요.');}}>직접 복사했어요<Check size={15}/></button>}</div>}
        {notice && <p className={s.notice} role="status">{notice}</p>}
        {storageBlocked && <p className={s.fine} role="status">이 브라우저에서는 기록을 저장할 수 없어요. 화면을 닫기 전에 요청문을 복사해두세요.</p>}
      </div>
      {step !== 8 && <footer className={s.dockFooter}>
        {step === 1 && <button type="button" className={s.primary} onClick={personalStart}>내 상황으로 요청문 만들기<ArrowRight size={18}/></button>}
        {step === 2 && <><span className={s.footerHint}>{requestReady(answers) ? '입력한 내용으로 요청문을 만들 수 있어요.' : '짧게 한 문장씩 적어도 충분해요.'}</span><button type="submit" form="arrival-brief" className={s.primary} disabled={!requestReady(answers)}>내 요청문 만들기<ArrowRight size={18}/></button></>}
        {step === 3 && prompt && (state.handoff === 'copied' ? <button type="button" className={s.primary} onClick={() => {update({experience: 'self-reported', step: 5}); setNotice('');}}>답변을 받았어요<Check size={18}/></button> : <button type="button" className={s.primary} onClick={() => copy(prompt, true)}><Copy size={17}/>요청문 복사하기</button>)}
        {step === 5 && <button type="button" className={s.primary} onClick={headToHall}>라이브 홀로 이동<ArrowRight size={18}/></button>}
        {step === 7 && <div className={s.calendarButtons}>{calendarLink && <a href={calendarLink} target="_blank" rel="noreferrer"><CalendarDays size={18}/>Google 캘린더<ArrowUpRight size={14}/></a>}<button type="button" onClick={saveCalendar}><CalendarDays size={18}/>아이폰·기타 캘린더<ArrowRight size={14}/></button></div>}
      </footer>}
      </>}
    </section>}
    {!officeIntro && (explore || sceneStatus === 'ready') && <button className={s.exploreButton} type="button" onClick={() => setExplore(!explore)}>{explore ? '체험 계속하기' : '공간 둘러보기'}{explore ? <ArrowLeft size={15}/> : <ArrowUpRight size={15}/>}</button>}
    {step === 7 && explore && sceneStatus === 'ready' && <div className={entryStyle.hallControls}>
      <p className={entryStyle.keyboardHint}>바닥을 클릭하거나 방향키로 이동하세요.</p>
      <p className={entryStyle.touchHint}>가고 싶은 바닥을 터치하세요.</p>
    </div>}
    <dialog ref={deskDialog} className={entryStyle.monitor} aria-label={destination} onCancel={event => {event.preventDefault(); event.stopPropagation(); closeDesk();}}>
      {deskOpen && station !== 6 && station !== 7 && <CorridorPanel station={station} config={config} review={state.deskReview}
        onReview={(phase, choice) => update({deskReview: {phase, choice}})}
        proposalSent={state.proposalSent} onProposal={() => update({proposalSent: true})}
        ruleChoice={state.companyRule} onRuleChoice={companyRule => update({companyRule})}
        onClose={closeDesk} onComplete={finishStation}/>}
    </dialog>
    <dialog ref={introDialog} className={s.exampleDialog} aria-label="체험 소개" onCancel={event => {event.stopPropagation(); setIntroOpen(false);}}>
      <header><h2>{config.title}</h2><button type="button" aria-label="소개 닫기" onClick={() => setIntroOpen(false)}><X size={20}/></button></header>
      <div className={s.exampleBody}><p>{config.description}</p><ul>{config.welcomeBenefits.map((benefit, i) => <li key={i}>{benefit}</li>)}</ul></div>
    </dialog>
    <dialog ref={exampleDialog} className={s.exampleDialog} onCancel={() => setShowExample(false)} aria-labelledby="arrival-example-title">
      <header><div><span>미리 준비한 결과 예시</span><h2 id="arrival-example-title">{content.goal}</h2></div><button type="button" aria-label="결과 예시 닫기" onClick={() => setShowExample(false)}><X size={20}/></button></header>
      <div className={s.exampleBody}><ResultExample text={content.example.before}/></div>
      <footer><button type="button" className={s.primary} onClick={() => {setShowExample(false); setExplore(false); personalStart();}}>내 상황으로 직접 해보기<ArrowRight size={17}/></button></footer>
    </dialog>
    <dialog ref={resetDialog} className={s.dialog} onCancel={() => setShowReset(false)} aria-labelledby="arrival-reset-title"><button type="button" className={s.close} aria-label="닫기" onClick={() => setShowReset(false)}><X size={20}/></button><h2 id="arrival-reset-title">처음부터 다시 볼까요?</h2><p>이 브라우저에 적은 내용과 진행 위치를 지워요. 개인 AI의 대화는 그대로 남습니다.</p><div className={s.dialogActions}><button type="button" className={s.secondary} onClick={() => setShowReset(false)}>계속 체험하기</button><button type="button" className={s.primary} onClick={reset}>지우고 처음부터</button></div></dialog>
  </main>;
}
