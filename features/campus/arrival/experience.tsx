'use client';

import {useEffect, useEffectEvent, useMemo, useRef, useState} from 'react';
import {ArrowUpRight, ArrowRight, ArrowLeft, BookOpen, Check, Copy, CalendarDays, BriefcaseBusiness, Compass, Lightbulb, RotateCcw, X, MoreHorizontal, ChevronDown, FileText} from 'lucide-react';
import {audiences, audienceContent, buildRevision, buildCriteria, revisionOptions, requestReady, type Audience, type Answers, ANSWER_LIMIT} from './content';
import {initialArrivalState, parseArrivalState, serializeArrivalState, reconcileArrivalOfficeCase, ARRIVAL_STORAGE_KEY, SPY_PHASES, corridorNext, liveCountdownLabel, personalRequestRule, addPersonalRequestRule, googleCalendarUrl, calendarIcs, arrivalBackStep, isPersonalTrialStep, type ArrivalState, type ArrivalStep, type CorridorStation, type SpyPhase, type CanonPhase} from './model';
import {CorridorScene} from './corridor-scene';
import {guideTitles, OnboardingProgram, type OnboardingGuide} from './onboarding-program';
import {CorridorPanel} from './corridor-panel';
import {reuseContentStationAnswers} from './content-station-prompt';
import {TeamLeader} from './team-leader';
import entryStyle from './office-entry.module.css';
import {WorkTrialPanel} from './work-trial-panel';
import {VisitorAvatar} from './visitor-avatar';
import {DEFAULT_WORK_TRIAL} from './work-trial';
import {officeCaseContent, officeCaseRevision} from './office-demo-case';
import {DEFAULT_OFFICE_DEMO} from './office-demo';
import s from './experience.module.css';
import theme from '../ui/theme.module.css';
import {DEFAULT_ARRIVAL, buildManagedRequest, arrivalLiveEvent, type ArrivalConfig} from './config';

const icons = {work: FileText, business: BriefcaseBusiness, preparing: Compass, exploring: Lightbulb};
const destinations = ['팀장 봇', '경쟁사 스파이', '콘텐츠 담당자', '정본 · 회사 업무 기준', '', '내 AI 체험', '웰컴 라운지'] as const;
const invitations = ['팀장 만나기', '경쟁사 스파이에게 가기', '콘텐츠 담당자에게 가기', '정본 보러 가기', '', '내 AI 체험 열기', '웰컴 라운지로 가기'] as const;

/** Optional [section] lines keep editable examples readable; other text stays literal. */
function ResultExample({text}: {text: string}) {
  return <div className={s.resultSections}>{text.split(/\n\s*\n/).filter(Boolean).map((block, index) => {
    const section = block.match(/^\[([^\]\n]{1,60})\]\n([\s\S]*)$/);
    return section ? <section key={index}><h3>{section[1]}</h3><p>{section[2]}</p></section> : <p key={index}>{block}</p>;
  })}</div>;
}

function LiveCountdown({date, className}: {date: string; className: string}) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const update = () => setLabel(liveCountdownLabel(date));
    const first = window.setTimeout(update, 0);
    const refresh = window.setInterval(update, 60_000);
    window.addEventListener('pageshow', update);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(refresh);
      window.removeEventListener('pageshow', update);
    };
  }, [date]);
  return label ? <span className={className}>{label}</span> : null;
}

export function ArrivalExperience({config = DEFAULT_ARRIVAL, persistenceKey = ARRIVAL_STORAGE_KEY, preview = false, embedded = false}: {config?: ArrivalConfig; persistenceKey?: string | null; preview?: boolean; embedded?: boolean}) {
  const [savedState, setState] = useState<ArrivalState>(initialArrivalState);
  const caseRevision = officeCaseRevision(config.officeDemo ?? DEFAULT_OFFICE_DEMO);
  const state = useMemo(() => reconcileArrivalOfficeCase(savedState, caseRevision), [savedState, caseRevision]);
  const [hydrated, setHydrated] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [notice, setNotice] = useState('');
  const [copyFallback, setCopyFallback] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [sceneStatus, setSceneStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [walkRequest, setWalkRequest] = useState(0);
  const [focusRequest, setFocusRequest] = useState(0);
  const [walkAssist, setWalkAssist] = useState<'idle' | 'moving' | 'open'>('idle');
  const [nearStation, setNearStation] = useState<CorridorStation>();
  const [sceneVisit, setSceneVisit] = useState(0);
  const [explore, setExplore] = useState(false);
  const [deskOpen, setDeskOpen] = useState(false);
  const [lobbyGuide, setLobbyGuide] = useState<OnboardingGuide | null>(null);
  const [revisitContent, setRevisitContent] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const lobbyDialog = useRef<HTMLDialogElement>(null);
  const lobbyGuideTrigger = useRef<HTMLButtonElement | null>(null);
  const sceneFrame = useRef<HTMLIFrameElement>(null);
  const introDialog = useRef<HTMLDialogElement>(null);
  const deskButton = useRef<HTMLButtonElement>(null);
  const leaderTrigger = useRef<HTMLElement | null>(null);
  const restoreLeaderFocus = useRef(false);
  const resetDialog = useRef<HTMLDialogElement>(null);
  const exampleDialog = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const focusCopiedRequest = useRef(false);
  const focusHallSchedule = useRef(false);
  const walkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const visited = useRef(false);
  const step = state.step;
  const officeIntro = step === 0;
  const station = state.station;
  const canOpenStation = sceneStatus !== 'ready' || nearStation === station || walkAssist === 'open';
  const firstStop = station === 1;
  const openDeskStation = revisitContent ? 3 : deskOpen && (station === 2 || station === 3 || station === 4) ? station : null;
  const teamLeaderOpen = officeIntro && firstStop && deskOpen;
  const backgroundInert = teamLeaderOpen || openDeskStation !== null;
  const exploringHall = step === 7 && explore;
  const destination = destinations[station - 1];
  const workConfig = config.workTrial ?? DEFAULT_WORK_TRIAL;
  const workActive = state.audience === 'work' && ![0, 7, 8].includes(step);
  const room = step === 7 ? 'live' : 'office';
  const content = {...audienceContent[state.audience], ...config.audiences[state.audience]};
  const answers = state.answers[state.audience];
  const canReuseDraft = step === 2 && state.audience === 'business'
    && reuseContentStationAnswers(state.contentDraft.inputs, answers) !== answers;
  const effectiveAnswers = state.mode === 'example' ? content.example : answers;
  const offeredRule = state.audience !== 'work' && state.companyRule !== null
    ? officeCaseContent(config.officeDemo ?? DEFAULT_OFFICE_DEMO).choices[state.companyRule].rule : '';
  const appliedRule = personalRequestRule(state, offeredRule);
  const prompt = addPersonalRequestRule(buildManagedRequest(config, state.audience, effectiveAnswers), appliedRule);
  const revision = buildRevision(state.audience, state.revision, state.extra);
  const criteria = buildCriteria(state.audience, effectiveAnswers, state.revision, {mode: state.mode, extra: state.extra})
    .slice(0, 3).map(item => item.label === '맡길 일' ? {...item, value: content.goal} : item);
  if (appliedRule) criteria.push({label: '내가 선택한 작성 기준', value: appliedRule});
  const event = arrivalLiveEvent(config);
  const calendarLink = googleCalendarUrl(event);
  const date = new Date(config.startsAt);
  const dateLabel = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',month:'long',day:'numeric'}).format(date);
  const timeLabel = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit',hour12:true}).format(date).replace(/:(\d{2})$/, (_, minutes: string) => minutes === '00' ? '시' : `시 ${Number(minutes)}분`);
  const weekday = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',weekday:'long'}).format(date);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const restored = persistenceKey ? parseArrivalState(localStorage.getItem(persistenceKey)) : initialArrivalState();
        setState(restored);
        setExplore(restored.step === 7);
      }
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
    if (exploringHall || step !== 7 || !focusHallSchedule.current) return;
    focusHallSchedule.current = false;
    heading.current?.focus({preventScroll: true});
  }, [exploringHall, step]);
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
    if (step !== 3 || state.handoff !== 'copied' || copyFallback || !focusCopiedRequest.current) return;
    focusCopiedRequest.current = false;
    scrollArea.current?.scrollTo({top: 0, behavior: 'instant'});
    heading.current?.focus({preventScroll: true});
  }, [step, state.handoff, copyFallback]);

  useEffect(() => {
    const dialog = lobbyDialog.current;
    if (lobbyGuide && !revisitContent && dialog) {
      if (!dialog.open) dialog.showModal();
      dialog.querySelector('h2')?.focus({preventScroll: true});
    } else dialog?.close();
  }, [lobbyGuide, revisitContent]);
  useEffect(() => {
    if (teamLeaderOpen || !restoreLeaderFocus.current) return;
    const frame = requestAnimationFrame(() => {
      restoreLeaderFocus.current = false;
      const trigger = leaderTrigger.current;
      leaderTrigger.current = null;
      (trigger?.isConnected && !trigger.hidden ? trigger : deskButton.current)?.focus({preventScroll: true});
    });
    return () => cancelAnimationFrame(frame);
  }, [teamLeaderOpen]);
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

  function updateProximity(at: CorridorStation, near: boolean) {
    if (at !== station || step !== 0 || deskOpen) return;
    if (near) resetWalkAssist();
    setNearStation(previous => near ? at : previous === at ? undefined : previous);
  }
  function arrive(at: CorridorStation) {
    if (at !== station || step !== 0 || deskOpen) return;
    resetWalkAssist();
    if (at === 7) go(7);
    else {
      if (at === 1) {
        const active = document.activeElement;
        const frameTarget = active instanceof HTMLIFrameElement ? active.contentDocument?.activeElement : null;
        leaderTrigger.current = frameTarget?.matches('#destination, #floor') ? frameTarget as HTMLElement : deskButton.current;
      }
      setDeskOpen(true);
    }
  }
  function finishStation() {
    if (station === 5 || station === 6 || station === 7 || (station === 2 && state.spyPhase !== 'handed-off')) return;
    closeDesk(false);
    setNearStation(undefined);
    update({station: corridorNext[station]});
  }
  function advanceSpy(next: SpyPhase) {
    setState(value => {
      const current = reconcileArrivalOfficeCase(value, caseRevision);
      const expected = SPY_PHASES[SPY_PHASES.indexOf(current.spyPhase) + 1];
      return current.station === 2 && next === expected ? {...current, spyPhase: next} : current;
    });
  }
  function advanceCanon(next: CanonPhase) {
    setState(value => {
      const current = reconcileArrivalOfficeCase(value, caseRevision);
      const valid = next === current.canonPhase + 1 || (next === 0 && current.canonPhase === 3);
      return current.station === 4 && valid ? {...current, canonPhase: next} : current;
    });
  }
  function headToHall() {
    go(7, {station: 7, hallReturnStep: isPersonalTrialStep(step) ? step : 8});
  }
  function returnToCorridor() {
    const lastDesk = state.spyPhase === 'handed-off' ? 4 : 2;
    go(0, {station: lastDesk});
    setNearStation(lastDesk);
    if (sceneStatus === 'ready') restoreFloorFocus();
    else requestAnimationFrame(() => deskButton.current?.focus({preventScroll: true}));
  }
  function openPersonalTrial() {
    go(arrivalBackStep(state), {station: 6});
  }
  function closeContentReplay() {
    setRevisitContent(false);
  }
  function openContentReplay() {
    lobbyDialog.current?.close();
    setRevisitContent(true);
  }
  function openLobbyGuide(guide: OnboardingGuide, trigger: HTMLButtonElement | null = null) {
    lobbyGuideTrigger.current = trigger;
    setLobbyGuide(guide);
  }
  function closeLobbyGuide() {
    lobbyDialog.current?.close();
    setLobbyGuide(null);
    const trigger = lobbyGuideTrigger.current;
    lobbyGuideTrigger.current = null;
    requestAnimationFrame(() => {
      if (lobbyDialog.current?.open) return;
      if (trigger?.isConnected) trigger.focus({preventScroll: true});
      else restoreFloorFocus();
    });
  }
  function openHallSchedule() {
    focusHallSchedule.current = true;
    setExplore(false);
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
  function closeDesk(returnToTrigger = true) {
    setDeskOpen(false);
    if (teamLeaderOpen) {
      if (!returnToTrigger) leaderTrigger.current = null;
      restoreLeaderFocus.current = true;
    } else requestAnimationFrame(() => {
      if (sceneStatus === 'ready') restoreFloorFocus();
      else deskButton.current?.focus({preventScroll: true});
    });
  }
  function restoreFloorFocus() {
    sceneFrame.current?.contentDocument?.getElementById('floor')?.focus({preventScroll: true});
    setFocusRequest(previous => previous + 1);
  }

  function update(patch: Partial<ArrivalState>) {setState(value => ({...reconcileArrivalOfficeCase(value, caseRevision), ...patch}));}
  function go(next: ArrivalStep, route: Pick<Partial<ArrivalState>, 'station' | 'hallReturnStep'> = {}) {
    resetWalkAssist();
    setDeskOpen(false);
    setIntroOpen(false);
    if (menu.current) menu.current.open = false;
    setNotice('');
    setCopyFallback('');
    setRevisitContent(false);
    setLobbyGuide(null);
    setExplore(next === 7);
    update({...route, step: next});
  }
  function selectAudience(audience: Audience) {
    update({audience, consentedCompanyRule: audience === state.audience ? state.consentedCompanyRule : '',
      mode: 'personal', experience: 'none', handoff: 'ready', extra: '', step: 1});
    setNotice(''); setCopyFallback('');
  }
  function answer(field: keyof Answers, value: string) {
    setState(previous => ({...reconcileArrivalOfficeCase(previous, caseRevision), experience: 'none', handoff: 'ready', answers: {...previous.answers, [previous.audience]: {...previous.answers[previous.audience], [field]: value}}}));
  }
  function importContentAnswers() {
    setState(previous => {
      const current = reconcileArrivalOfficeCase(previous, caseRevision);
      if (current.step !== 2 || current.audience !== 'business') return previous;
      const business = reuseContentStationAnswers(current.contentDraft.inputs, current.answers.business);
      if (business === current.answers.business) return previous;
      return {...current, experience: 'none', handoff: 'ready', answers: {...current.answers, business}};
    });
    setNotice('비어 있던 칸에 가져왔어요. 아래에서 내용을 확인하고 수정할 수 있어요.');
  }
  async function copy(text: string, handoff = false) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyFallback('');
      if (handoff) markRequestCopied();
      else setNotice('복사했어요. 같은 AI 대화에 이어서 보내주세요.');
    } catch {
      setCopyFallback(text);
      setNotice('아래 글을 전체 선택해 직접 복사해 주세요.');
    }
  }
  function markRequestCopied() {
    focusCopiedRequest.current = state.handoff !== 'copied' || Boolean(copyFallback);
    update({handoff: 'copied'});
    setCopyFallback('');
    setNotice(state.handoff === 'copied' ? '요청문을 다시 복사했어요.' : '');
  }
  function saveCalendar() {
    const text = calendarIcs(event);
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], {type: 'text/calendar;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = `moonshot-live-${event.date.replaceAll('-', '')}.ics`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setNotice('일정 파일을 열고 ‘추가’를 누르세요. 카톡에서 파일이 안 열리면 Safari로 이 페이지를 열어주세요.');
  }
  function reset() {
    if (menu.current) menu.current.open = false;
    try {if (persistenceKey) localStorage.removeItem(persistenceKey);} catch {}
    resetWalkAssist();
    setNearStation(undefined);
    setSceneVisit(value => value + 1); setSceneStatus('loading'); setWalkRequest(0);
    setState({...initialArrivalState(), visitorAvatar: state.visitorAvatar}); setDeskOpen(false); setLobbyGuide(null); setIntroOpen(false); setCopyFallback(''); setExplore(false); setShowReset(false); setNotice('');
  }
  function exampleFinish() {update({mode: 'example', experience: 'example-viewed', handoff: 'ready', step: 5}); setNotice('');}
  function personalStart() {update({mode: 'personal', experience: 'none', step: 2}); setNotice('');}
  const title = (text: React.ReactNode, description?: string) => <div className={s.intro}><h1 ref={heading} tabIndex={-1}>{text}</h1>{description && <p>{description}</p>}</div>;

  return <main className={`${theme.surface} ${s.root} ${embedded ? s.embedded : ''}`} data-room={room} data-office-entry={officeIntro || undefined} data-scene-status={sceneStatus}>
    <a href={officeIntro ? '#arrival-desk-button' : exploringHall ? '#arrival-hall-schedule' : '#arrival-content'} className={s.skip} inert={backgroundInert}>체험 안내로 바로가기</a>
    <div className={s.world} aria-label="웰컴존에서 웰컴 라운지까지 이어지는 통로" inert={backgroundInert}>
      {hydrated && <CorridorScene key={sceneVisit} frame={sceneFrame} station={station} label={destination}
        avatar={state.visitorAvatar}
        paused={deskOpen || Boolean(lobbyGuide) || revisitContent || introOpen || avatarOpen || showReset || (!officeIntro && !explore)}
        freeRoam={exploringHall} onOpenGuide={openLobbyGuide}
        walkRequest={walkRequest} focusRequest={focusRequest} onProximity={updateProximity} onArrive={arrive} onStatus={setSceneStatus} className={s.scene}/>}
    </div>
    <header className={s.header} inert={backgroundInert} style={teamLeaderOpen ? {visibility: 'hidden'} : undefined}>
      <div className={s.wordmark}>{/* eslint-disable-next-line @next/next/no-img-element -- Reuse the existing EDU brand asset. */}
      <img src="/brandy-action-logo.png" alt="브랜디액션"/><small>EDU</small></div>
      <div className={entryStyle.progress} aria-live="polite" aria-atomic="true">
        <span>문샷 웰컴존</span><i aria-hidden="true"/>
        {station === 7 ? <b>{destination}</b> : <><b>{station === 6 ? '체험' : String(station).padStart(2, '0') + ' / 04'}</b><strong>{destination}</strong></>}
      </div>
      <details ref={menu} className={s.menu}><summary aria-label="체험 메뉴"><MoreHorizontal size={23}/></summary><div><span>{preview ? '저장 전 관리자 미리보기' : '브랜치 미리보기'}</span><button type="button" onClick={() => {if (menu.current) menu.current.open = false; setIntroOpen(true);}}>체험 소개</button>{!officeIntro && step !== 7 && <button type="button" onClick={headToHall}><CalendarDays size={16}/>웰컴 라운지로 이동</button>}<button type="button" onClick={() => persistenceKey ? setShowReset(true) : reset()}><RotateCcw size={16}/>처음부터 보기</button></div></details>
    </header>
    {officeIntro && firstStop && sceneStatus === 'ready' && !teamLeaderOpen && <div className={entryStyle.avatarControl}>
      <VisitorAvatar value={state.visitorAvatar} onChange={visitorAvatar => update({visitorAvatar})} onOpenChange={setAvatarOpen} persistent={Boolean(persistenceKey) && !storageBlocked}/>
    </div>}
    {officeIntro ? <section className={`${entryStyle.wayfinding} ${firstStop ? entryStyle.firstStop : ''}`} aria-label={firstStop ? '문샷 웰컴존 소개' : '현재 목적지'} data-walk-station={station} inert={backgroundInert} style={teamLeaderOpen ? {visibility: 'hidden'} : undefined}>
      <div className={entryStyle.stopCopy}>
        {firstStop ? <>
          <h1>{config.title}</h1>
          <p>고객 후기 분석부터 광고 영상 제작까지, AI 직원들의 업무를 차례로 확인해보세요.</p>
          <p className={entryStyle.materialsPreview}><BookOpen size={17} aria-hidden="true"/><span>라운지에서 받는 무료 자료<strong>AI팀 설계도와 회사 업무 기준표</strong></span></p>
        </> : <>
          <span>{nearStation === station ? '도착했어요' : '다음 목적지'}</span>
          <h1>{destination}</h1>
          {station === 4 && <p className={entryStyle.nextReward}>여길 지나면 무료 자료가 있는 웰컴 라운지예요.</p>}
          {station === 7 && <p className={entryStyle.nextReward}>AI팀 설계도와 회사 업무 기준표를 받아보세요.</p>}
        </>}
      </div>
      <div className={entryStyle.wayfindingActions}>
        <button id="arrival-desk-button" type="button" ref={deskButton} onClick={walkToStation} disabled={!canOpenStation && walkAssist === 'moving'}>
          {sceneStatus === 'loading' && firstStop ? '팀장 안내 보기' : canOpenStation ? station === 7 ? '웰컴 라운지 입장하기' : '내용 열기' : walkAssist === 'moving' ? '이동 중' : invitations[station - 1]}<ArrowRight size={16}/>
        </button>
        {sceneStatus === 'loading' ? <p role="status">공간을 준비하고 있어요.</p> : !canOpenStation && <div className={entryStyle.movementHint}>
          <p className={entryStyle.keyboardHint}>스페이스바로 다음 목적지에 갈 수 있어요.</p>
          <p className={entryStyle.touchHint}>화살표 쪽 바닥을 눌러도 이동해요.</p>
        </div>}
      </div>
    </section> : <section className={`${s.dock} ${workActive ? s.workDock : ''} ${step === 3 && !workActive ? s.handoffDock : ''} ${step === 7 ? s.hallDock : ''} ${explore ? s.dockHidden : ''}`} aria-label="캠퍼스 체험 안내" inert={backgroundInert}>
      {workActive ? <WorkTrialPanel config={workConfig} state={state.workTrial} persistenceEnabled={Boolean(persistenceKey)} storageBlocked={storageBlocked}
        onChange={workTrial => update({workTrial, experience: workTrial.secondConfirmed ? 'self-reported' : 'none'})}
        onExit={() => go(8)} onLive={headToHall}/> : <>
      <div className={s.dockTop}><span>{step === 8 ? '내 상황에 맞는 체험' : step === 7 ? '무료 라이브 일정' : config.audiences[state.audience].label}</span><button type="button" className={s.back} onClick={step === 7 ? openPersonalTrial : () => go(arrivalBackStep(state), step === 8 ? {station: 7} : {})}>{step === 7 && state.hallReturnStep === null ? <ArrowRight size={14}/> : <ArrowLeft size={14}/>}
        {step === 7 ? state.hallReturnStep === null ? '내 AI 체험으로 가기' : '내 AI 체험으로 돌아가기' : step === 8 ? '웰컴 라운지로 돌아가기' : '이전'}</button></div>
      <div ref={scrollArea} className={s.scrollArea} id="arrival-content" key={step}>
        {step === 8 && <>
          {title(<>지금 어떤 상황이신가요?</>, '가장 가까운 상황을 골라주세요. 나에게 맞는 결과 예시부터 보여드릴게요.')}
          <div className={s.choices} aria-label="내 상황에 맞는 체험 선택">{audiences.map(id => {const Icon = icons[id]; return <button type="button" key={id} onClick={() => selectAudience(id)}><span className={s.choiceIcon}><Icon size={21}/></span><span><strong>{config.audiences[id].label}</strong><small>{config.audiences[id].goal}</small></span><ArrowRight size={17}/></button>;})}</div>
          <div className={s.liveTeaser}><p>{dateLabel} {timeLabel} · 무료 라이브</p><strong>{config.liveTitle}</strong><button type="button" className={s.textButton} onClick={headToHall}>웰컴 라운지로 이동<ArrowRight size={16}/></button></div>
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
          {(canReuseDraft || notice) && <div className={s.reuseDraft}>
            {canReuseDraft && <button type="button" className={s.textButton} onClick={importContentAnswers}><Copy size={16} aria-hidden="true"/>콘텐츠 담당자에게 적은 내용 가져오기</button>}
            <p role="status">{notice}</p>
          </div>}
          <form id="arrival-brief" className={s.questions} onSubmit={event => {event.preventDefault(); if (requestReady(answers)) {update({mode: 'personal', experience: 'none', handoff: 'ready', step: 3}); setNotice('');}}}>
            <label><span><b>1</b>{content.q1}</span><textarea rows={2} maxLength={ANSWER_LIMIT} value={answers.a} onChange={e => answer('a', e.target.value)} placeholder={`예: ${content.example.a}`} required/><small>{content.hint1}</small></label>
            <label><span><b>2</b>{content.q2}</span><textarea rows={2} maxLength={ANSWER_LIMIT} value={answers.b} onChange={e => answer('b', e.target.value)} placeholder={`예: ${content.example.b}`} required/><small>{content.hint2}</small></label>
            {offeredRule && <label className={s.ruleOptIn}>
              <input type="checkbox" checked={Boolean(appliedRule)} onChange={event => update({
                consentedCompanyRule: event.target.checked ? offeredRule : '', handoff: 'ready', experience: 'none',
              })}/>
              <span>방금 고른 기준을 내 요청에도 쓰기<small>{offeredRule}</small></span>
            </label>}
          </form>
          <p className={s.fine}>이름·연락처·회사 기밀은 적지 마세요.<br/>{persistenceKey ? '적은 내용은 이 브라우저에만 저장돼요.' : '미리보기 입력은 저장하지 않아요. 닫으면 사라져요.'}</p>
        </>}
        {step === 3 && <>
          {title(state.handoff === 'copied' ? '요청문을 복사했어요.' : 'AI에게 보낼 요청문이 준비됐어요.')}
          {!prompt ? <div className={s.recovery}><p>내 상황 두 가지를 먼저 알려주세요.</p><button type="button" className={s.primary} onClick={() => go(2)}>내 상황 입력하기<ArrowRight size={18}/></button></div> : <>
            {copyFallback ? <div className={s.copyFallback}><p className={s.notice} role="status">{notice}</p><label>직접 복사할 요청문<textarea ref={fallbackRef} readOnly value={copyFallback}/></label><button type="button" className={s.secondary} onClick={markRequestCopied}>직접 복사했어요<Check size={15}/></button></div>
              : state.handoff === 'copied' ? <div className={s.handoffCopy}>
                <p>평소 쓰는 AI의 새 대화에 붙여넣고 보내세요.</p>
                <div className={s.aiLinks}><a href="https://chatgpt.com/" target="_blank" rel="noreferrer">ChatGPT 열기<ArrowUpRight size={15}/></a><a href="https://claude.ai/new" target="_blank" rel="noreferrer">Claude 열기<ArrowUpRight size={15}/></a></div>
                <p className={s.fine}>답변을 받으면 이 탭으로 돌아와 아래 버튼을 눌러주세요.</p>
                <button type="button" className={s.textButton} onClick={() => copy(prompt, true)}><Copy size={14}/>요청문 다시 복사</button>
                {notice && <p className={s.notice} role="status">{notice}</p>}
              </div> : <div className={s.handoffCopy}>
                <p>먼저 아래 버튼으로 내 요청문을 복사하세요. 이어서 평소 쓰는 AI를 열 수 있어요.</p>
                <details className={s.promptDetails}><summary>보낼 요청문 확인<ChevronDown size={14}/></summary><textarea aria-label="AI에게 보낼 요청문" readOnly value={prompt}/></details>
              </div>}
          </>}
        </>}
        {step === 5 && <>
          <span className={s.achievement}><Check size={15}/>{state.experience === 'example-viewed' ? '체험 예시 확인' : state.experience === 'self-reported' ? '개인 AI 답변 확인' : '요청문 준비 완료'}</span>
          {title(<>매번 같은 설명을<br/><em>반복하지 않으려면?</em></>, '자주 쓰는 자료와 원하는 결과의 기준을 정리해두세요. AI 직원이 일을 할 때 참고할 업무 매뉴얼이 됩니다.')}
          {state.mode === 'example' ? <details className={s.disclosure}><summary>수정 요청과 결과 예시 보기<ChevronDown size={16}/></summary><div><span className={s.miniLabel}>이렇게 부탁했어요</span><p>“{content.example.revision}”</p><span className={s.miniLabel}>다듬은 결과 · 체험용 예시</span><ResultExample text={content.example.after}/></div></details> : <details className={s.disclosure}><summary>답변을 한 번 더 다듬고 싶어요<ChevronDown size={16}/></summary><div><p>아쉬운 점을 골라 같은 AI 대화에 이어서 보내세요.</p><div className={s.revisionChoices}>{revisionOptions.map(option => <button type="button" key={option.id} aria-pressed={state.revision === option.id} onClick={() => update({revision: option.id})}>{option.label}</button>)}</div>{state.revision === 'different' && <label className={s.extraLabel}>어떤 부분이 달랐나요?<textarea rows={2} maxLength={300} value={state.extra} onChange={e => update({extra: e.target.value})} placeholder="예: 선생님이 아니라 학부모에게 보내는 글이에요."/></label>}<p className={s.resultText}>{revision}</p><button type="button" className={s.secondary} disabled={!revision} onClick={() => copy(revision)}><Copy size={15}/>수정 요청 복사</button></div></details>}
          <details className={s.disclosure}><summary>{state.mode === 'example' ? '예시에서 AI에게 알려준 내용' : 'AI에게 알려준 내용 보기'}<ChevronDown size={16}/></summary><div className={s.criteria}>{criteria.map(item => <p key={item.label}><strong>{item.label}</strong>{item.value}</p>)}<button className={s.textButton} type="button" onClick={() => copy(criteria.map(x => `${x.label}: ${x.value}`).join('\n'))}><Copy size={14}/>기준 복사하기</button></div></details>
          <p className={s.insight}>{content.bridge}<br/><strong>{dateLabel} 라이브에서 방법을 알려드립니다.</strong></p>
          {state.mode === 'example' && <button type="button" className={s.textButton} onClick={personalStart}>내 상황으로 직접 해보기<ArrowRight size={14}/></button>}
        </>}
        {step === 7 && <>
          {title(config.liveTitle)}
          <div className={s.ticket}>
            <p><strong>{dateLabel} {weekday}</strong><br/>{timeLabel} <small>한국 시간</small></p>
            {!exploringHall && event.startsAt && <LiveCountdown date={event.date} className={entryStyle.ticketCountdown}/>}
          </div>
          <p className={s.calendarIntro}>{config.liveUrl ? '캘린더에서도 라이브 링크를 확인할 수 있어요.' : '유튜브 참여 링크는 카톡방에서 안내할 예정이에요.'}</p>
          {config.liveUrl && <a className={s.textButton} href={config.liveUrl} target="_blank" rel="noreferrer">라이브 참여 링크<ArrowUpRight size={16}/></a>}
          <details className={s.disclosure}><summary>라이브에서 배우는 내용<ChevronDown size={16}/></summary><div><p>{state.audience === 'work' ? workConfig.liveBridge : content.bridge}</p></div></details>
          <div className={entryStyle.scheduleActions}>
            <button type="button" className={s.textButton} onClick={event => openLobbyGuide('materials', event.currentTarget)}><BookOpen size={16} aria-hidden="true"/>무료 자료 열기</button>
            <button type="button" className={s.textButton} onClick={returnToCorridor}><ArrowLeft size={16} aria-hidden="true"/>복도로 돌아가기</button>
          </div>
        </>}
        {step !== 3 && copyFallback && <div className={s.copyFallback}><label>직접 복사할 요청문<textarea ref={fallbackRef} readOnly value={copyFallback}/></label></div>}
        {step !== 2 && step !== 3 && step !== 7 && notice && <p className={s.notice} role="status">{notice}</p>}
        {storageBlocked && <p className={s.fine} role="status">이 브라우저에서는 기록을 저장할 수 없어요. 화면을 닫기 전에 요청문을 복사해두세요.</p>}
      </div>
      {step !== 8 && <footer className={s.dockFooter}>
        {step === 1 && <button type="button" className={s.primary} onClick={personalStart}>내 상황으로 요청문 만들기<ArrowRight size={18}/></button>}
        {step === 2 && <><span className={s.footerHint}>{requestReady(answers) ? '입력한 내용으로 요청문을 만들 수 있어요.' : '짧게 한 문장씩 적어도 충분해요.'}</span><button type="submit" form="arrival-brief" className={s.primary} disabled={!requestReady(answers)}>내 요청문 만들기<ArrowRight size={18}/></button></>}
        {step === 3 && prompt && (state.handoff === 'copied' ? <button type="button" className={s.primary} onClick={() => {update({experience: 'self-reported', step: 5}); setNotice('');}}>답변을 받았어요<Check size={18}/></button> : <button type="button" className={s.primary} onClick={() => copy(prompt, true)}><Copy size={17}/>요청문 복사하기</button>)}
        {step === 5 && <button type="button" className={s.primary} onClick={headToHall}>웰컴 라운지로 이동<ArrowRight size={18}/></button>}
        {step === 7 && <div className={s.calendarActions}>
          <p className={s.calendarHint}>캘린더에 일정 추가</p>
          <div className={s.calendarButtons}>{calendarLink && <a href={calendarLink} target="_blank" rel="noreferrer" onClick={() => setNotice('Google 캘린더에서 ‘저장’을 눌러주세요.')}><CalendarDays size={16} aria-hidden="true"/>Google 캘린더<ArrowUpRight size={14} aria-hidden="true"/></a>}<button type="button" onClick={saveCalendar}><CalendarDays size={16} aria-hidden="true"/>아이폰·기타 캘린더<ArrowRight size={14} aria-hidden="true"/></button></div>
          <p className={s.calendarInstruction} role="status">{notice || (config.endsAt ? '캘린더에서 ‘저장’ 또는 ‘추가’를 누르면 완료돼요.' : '시작 시각을 담았어요. 캘린더에서 ‘저장’ 또는 ‘추가’를 눌러주세요.')}</p>
        </div>}
      </footer>}
      </>}
    </section>}
    {!officeIntro && !exploringHall && (step === 7 || explore || sceneStatus === 'ready') && <button className={s.exploreButton} type="button" inert={backgroundInert} onClick={() => setExplore(!explore)}>{explore ? '체험 계속하기' : '공간 둘러보기'}{explore ? <ArrowLeft size={15}/> : <ArrowUpRight size={15}/>}</button>}
    {exploringHall && <section className={entryStyle.hallControls} aria-label="웰컴 라운지에서 할 수 있는 일" inert={backgroundInert}>
      <div className={entryStyle.hallStatus}>
        {event.startsAt && <LiveCountdown date={event.date} className={entryStyle.hallCountdown}/>}
        {sceneStatus === 'ready' && <>
          <p className={entryStyle.keyboardHint}>바닥을 클릭하거나 방향키로 이동하세요.</p>
          <p className={entryStyle.touchHint}>가고 싶은 바닥을 터치하세요.</p>
        </>}
      </div>
      <div className={entryStyle.hallActions}>
        <button type="button" onClick={event => openLobbyGuide('materials', event.currentTarget)}><BookOpen size={17} aria-hidden="true"/>무료 자료 열기</button>
        <button type="button" id="arrival-hall-schedule" aria-controls="arrival-content" onClick={openHallSchedule}><CalendarDays size={17} aria-hidden="true"/>라이브 일정 보기</button>
        <button type="button" onClick={openPersonalTrial}>
          {state.hallReturnStep === null ? <ArrowRight size={16} aria-hidden="true"/> : <ArrowLeft size={16} aria-hidden="true"/>}
          {state.hallReturnStep === null ? '내 AI 체험으로 가기' : '내 AI 체험으로 돌아가기'}
        </button>
        <button type="button" onClick={returnToCorridor}><ArrowLeft size={16} aria-hidden="true"/>복도로 돌아가기</button>
      </div>
      {sceneStatus !== 'ready' && <div className={entryStyle.hallActions}>
        <button type="button" onClick={event => openLobbyGuide('intro', event.currentTarget)}>퇴사선배 윤익 소개</button>
      </div>}
    </section>}
    {teamLeaderOpen && <TeamLeader greeting={officeCaseContent(config.officeDemo ?? DEFAULT_OFFICE_DEMO).greeting} onClose={closeDesk} onComplete={finishStation}/>}
    {openDeskStation && <CorridorPanel station={openDeskStation}
      spyPhase={state.spyPhase} onSpyAdvance={advanceSpy} canonPhase={state.canonPhase} onCanonAdvance={advanceCanon}
      contentDraft={state.contentDraft} onContentDraftChange={contentDraft => update({contentDraft})}
      revisit={revisitContent} onClose={revisitContent ? closeContentReplay : closeDesk}
      onComplete={revisitContent ? closeContentReplay : finishStation}/>}
    <dialog ref={lobbyDialog} className={entryStyle.monitor} data-scroll-panel aria-label={lobbyGuide ? guideTitles[lobbyGuide] : undefined}
      onCancel={event => {event.preventDefault(); closeLobbyGuide();}}>
      {lobbyGuide && <OnboardingProgram key={lobbyGuide} guide={lobbyGuide} config={config} dateLabel={dateLabel} onContentReplay={openContentReplay}
        onClose={closeLobbyGuide} onOpenMaterials={() => setLobbyGuide('materials')}/>}
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
