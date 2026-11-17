'use client';

import {useEffect, useRef, useState} from 'react';
import {ArrowUpRight, ArrowRight, ArrowLeft, Check, Copy, CalendarDays, BriefcaseBusiness, Compass, Lightbulb, RotateCcw, X, MapPin, ChevronDown, FileText} from 'lucide-react';
import {audiences, audienceContent, buildRequest, buildRevision, buildCriteria, revisionOptions, requestReady, type Audience, type Answers, ANSWER_LIMIT} from './content';
import {initialArrivalState, parseArrivalState, serializeArrivalState, ARRIVAL_STORAGE_KEY, liveEvent, googleCalendarUrl, calendarIcs, type ArrivalState, type ArrivalStep} from './model';
import {Scene as ArrivalScene} from './scene';
import s from './experience.module.css';

const chapters = ['웰컴존', '체험 사무실', '라이브 홀'];
const locations = ['welcome', 'office', 'live'] as const;
const icons = {business: BriefcaseBusiness, preparing: Compass, exploring: Lightbulb};
const stageLabels = ['환영합니다', 'AI 직원의 일', '내 일 고르기', '요청문 준비', '내 AI로 실행', '한 번 더 다듬기', '함께 배우는 사람들', '12월 7일, 만나요'];

export function ArrivalExperience() {
  const [state, setState] = useState<ArrivalState>(initialArrivalState);
  const [hydrated, setHydrated] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [notice, setNotice] = useState('');
  const [copyFallback, setCopyFallback] = useState('');
  const resetDialog = useRef<HTMLDialogElement>(null);
  const [showReset, setShowReset] = useState(false);
  const [demo, setDemo] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const [explore, setExplore] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const visited = useRef(false);
  const step = state.step;
  const chapter = step === 0 ? 0 : step === 7 ? 2 : 1;
  const room = locations[chapter];
  const content = audienceContent[state.audience];
  const answers = state.answers[state.audience];
  const effectiveAnswers = state.mode === 'example' ? content.example : answers;
  const prompt = buildRequest(state.audience, effectiveAnswers);
  const revision = buildRevision(state.audience, state.revision, state.extra);
  const criteria = buildCriteria(state.audience, effectiveAnswers, state.revision, {mode: state.mode, extra: state.extra});
  const calendarLink = googleCalendarUrl(liveEvent);

  useEffect(() => {
    let active = true;
    // Restore after hydration so a saved browser journey never changes the SSR tree.
    queueMicrotask(() => {
      if (!active) return;
      try { setState(parseArrivalState(localStorage.getItem(ARRIVAL_STORAGE_KEY))); }
      catch { setStorageBlocked(true); }
      setHydrated(true);
    });
    return () => {active = false;};
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(ARRIVAL_STORAGE_KEY, serializeArrivalState(state)); }
    catch { queueMicrotask(() => setStorageBlocked(true)); }
  }, [state, hydrated]);
  useEffect(() => {
    if (!hydrated || !visited.current) { visited.current = hydrated; return; }
    heading.current?.focus({preventScroll: true});
    window.scrollTo({top: 0, behavior: 'instant'});
  }, [step, hydrated]);

  useEffect(() => {
    if (showReset) resetDialog.current?.showModal();
    else resetDialog.current?.close();
  }, [showReset]);

  function update(patch: Partial<ArrivalState>) { setState(value => ({...value, ...patch})); }
  function go(next: ArrivalStep) { setNotice(''); setCopyFallback(''); setExplore(false); update({step: next}); }
  function selectAudience(audience: Audience) { update({audience, mode: 'personal', experience: 'none', extra: ''}); setNotice(''); }
  function answer(field: keyof Answers, value: string) {
    setState(previous => ({...previous, experience: 'none', answers: {...previous.answers, [previous.audience]: {...previous.answers[previous.audience], [field]: value}}}));
  }
  async function copy(text: string) {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); setCopyFallback(''); setNotice('복사했어요. 내 AI의 대화창에 붙여넣어 주세요.'); }
    catch { setCopyFallback(text); promptRef.current?.focus(); promptRef.current?.select(); setNotice('자동 복사를 사용할 수 없어요. 요청문을 길게 누르거나 전체 선택해 직접 복사해 주세요.'); }
  }
  function saveCalendar() {
    const text = calendarIcs(liveEvent);
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], {type: 'text/calendar;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = 'moonshot-live-20261207.ics'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setNotice('일정 파일을 열고 캘린더에서 추가를 마쳐주세요. 카톡 안에서 열리지 않으면 Safari에서 이 페이지를 열어주세요.');
  }
  function reset() {
    try {localStorage.removeItem(ARRIVAL_STORAGE_KEY);} catch {}
    setState(initialArrivalState()); setCopyFallback(''); setDemo(0); setExplore(false); setShowReset(false); setNotice('이 브라우저의 체험 기록을 지웠어요.');
  }
  function startExample() { update({mode: 'example', experience: 'none', step: 3}); setNotice(''); }
  const nav = (next: ArrivalStep, label: string) => <button type="button" className={s.primary} onClick={() => go(next)}>{label}<ArrowRight size={19}/></button>;
  const title = (eyebrow: string, text: React.ReactNode, description?: string) => <div className={s.intro}><p className={s.eyebrow}>{eyebrow}</p><h1 tabIndex={-1} ref={heading}>{text}</h1>{description && <p className={s.lead}>{description}</p>}</div>;

  return <main className={s.root}>
    <a href="#arrival-content" className={s.skip}>체험 안내로 바로가기</a>
    <header className={s.header}>
      <button type="button" className={s.wordmark} aria-label="문샷 웰컴존으로" onClick={() => go(0)}><span className={s.logo}>m<span>↗</span></span><span>MOONSHOT<small>OPEN CAMPUS</small></span></button>
      <span className={s.previewBadge}>미리보기</span>
      <button type="button" className={s.liveLink} onClick={() => go(7)}><span className={s.liveDot}/>12.07 <span>PM 9:00</span><ArrowUpRight size={16}/></button>
    </header>

    <div className={s.progress} aria-label="캠퍼스 체험 경로">
      {chapters.map((label, i) => <button type="button" key={label} aria-current={chapter === i ? 'step' : undefined} onClick={() => go(([0, 1, 7] as const)[i])}><span>{String(i + 1).padStart(2, '0')}</span>{label}{i < 2 && <ArrowRight size={14}/>}</button>)}
      <span className={s.stageLabel}>{stageLabels[step]}</span>
    </div>

    <section className={`${s.layout} ${step === 0 ? s.hero : ''} ${explore ? s.exploring : ''}`}>
      <div id="arrival-content" className={s.story}>
        {step > 0 && <button type="button" className={s.back} onClick={() => go((step - 1) as ArrivalStep)}><ArrowLeft size={15}/>이전으로</button>}
        {step === 0 && <>
          {title('A SMALL START. A MOONSHOT.', <>AI가 바꾸는 일.<br/>이번엔, <em>내 차례.</em></>, '사업을 하고 있어도, 이제 시작하려 해도. 작은 일 하나를 AI에게 맡기는 순간부터 달라져요.')}
          <div className={s.heroActions}>{nav(1, '내 첫 AI 사무실 들어가기')}<span>설치 없이 · 로그인 없이</span></div>
          <div className={s.heroNote}><span className={s.noteLine}/><p>오늘은 결과 하나를.<br/><strong>12월 7일에는, 계속 함께 일할 방법을.</strong></p></div>
          <button type="button" className={s.textLink} onClick={() => go(7)}>라이브에서 무엇을 배우나요?<ArrowUpRight size={15}/></button>
        </>}

        {step === 1 && <>
          {title('01 / MEET YOUR AI COLLEAGUE', <>“응” 한마디 뒤에,<br/><em>무슨 일이 있었을까요?</em></>, '광고에서 본 AI 직원. 먼저 어떤 일을 맡겼고, 무엇을 알려줬는지 책상 위에서 살펴봐요.')}
          <div className={s.demoTabs} aria-label="AI 직원 업무 시연">{['일을 맡기고', '결과를 보고', '내 기준으로 고치기'].map((x,i) => <button type="button" key={x} aria-pressed={demo === i} onClick={() => setDemo(i)}><span>0{i+1}</span>{x}</button>)}</div>
          <div className={s.demoPaper}>
            <span className={s.paperCaption}>시연용 예시 · 소개글을 쓰는 직원</span>
            {demo === 0 ? <><span className={s.tag}>내가 알려준 일</span><h2>사진 정리 수업을<br/>부모님들께 소개해줘.</h2><dl><div><dt>누구에게</dt><dd>아이 사진이 휴대폰에 쌓인 부모</dd></div><div><dt>꼭 담을 것</dt><dd>내 휴대폰으로 직접 분류하는 실습</dd></div><div><dt>완료 기준</dt><dd>쉽고 자연스러운 소개글 세 문장</dd></div></dl></> : demo === 1 ? <><span className={s.tag}>직원이 가져온 첫 초안</span><p className={s.sampleText}>{audienceContent.business.example.before}</p><div className={s.marginNote}>초안이 나왔어요.<br/><strong>이제 내 말투인지 확인할 차례.</strong></div></> : <><span className={s.tag}>“친한 학부모에게 말하듯, 두 문장으로.”</span><p className={s.sampleText}>{audienceContent.business.example.after}</p><div className={s.marginNote}>일을 맡기고 → 결과를 보고 → 기준을 더하기.<br/><strong>AI와 함께 일하는 첫 번째 반복이에요.</strong></div></>}
          </div>
          <div className={s.actions}>{demo < 2 ? <button className={s.secondary} type="button" onClick={() => setDemo(demo + 1)}>다음 장면<ArrowRight size={17}/></button> : null}{nav(2, '이번엔 내 일로 해보기')}</div>
          <p className={s.fine}>이 장면은 준비한 예시예요. 실제 AI를 연결하거나 일을 실행하지 않습니다.</p>
        </>}

        {step === 2 && <>
          {title('02 / MAKE IT YOURS', <>지금 내게 필요한,<br/><em>작은 결과 하나.</em></>, '현재 상황과 가장 가까운 것을 골라주세요. 두 가지만 알려주면 준비가 끝나요.')}
          <div className={s.audienceList}>{audiences.map(id => {const Icon = icons[id]; return <button type="button" key={id} aria-pressed={state.audience === id} onClick={() => selectAudience(id)}><Icon size={22}/><span><strong>{audienceContent[id].label}</strong><small>{audienceContent[id].goal}</small></span><span className={s.radio}>{state.audience === id && <Check size={13}/>}</span></button>;})}</div>
          <div className={s.questions}><label><span><b>01</b>{content.q1}</span><textarea rows={2} maxLength={ANSWER_LIMIT} value={answers.a} onChange={e => answer('a', e.target.value)} placeholder={content.example.a}/><small>{content.hint1}</small></label><label><span><b>02</b>{content.q2}</span><textarea rows={2} maxLength={ANSWER_LIMIT} value={answers.b} onChange={e => answer('b', e.target.value)} placeholder={content.example.b}/><small>{content.hint2}</small></label></div>
          <div className={s.actions}><button type="button" className={s.primary} disabled={!requestReady(answers)} onClick={() => {update({mode: 'personal', experience: 'none', step: 3}); setNotice('');}}>AI에게 보낼 요청문 만들기<ArrowRight size={18}/></button><button type="button" className={s.textLink} onClick={startExample}>입력 없이 예시부터 보기<ArrowUpRight size={15}/></button></div>
          <p className={s.fine}>입력은 이 브라우저에만 남아요. 고객 이름·연락처처럼 개인을 알아볼 수 있는 정보는 적지 마세요.</p>
        </>}

        {step === 3 && <>
          {title('03 / YOUR FIRST BRIEF', <>“그냥 해줘”보다,<br/><em>내 일을 알게 해줘.</em></>, state.mode === 'example' ? '선택한 상황의 예시로 살펴볼게요. 내 이야기를 입력하면 나에게 맞는 요청문이 만들어져요.' : '아래 요청문에 방금 적은 이야기를 담았어요. 내 AI에게 그대로 건네주세요.')}
          {!prompt ? <div className={s.note}><p>내 상황 두 가지를 먼저 알려주세요.</p>{nav(2, '내 상황 입력하기')}</div> : <>
            <div className={s.brief}><div className={s.briefHead}><span><FileText size={17}/>{state.mode === 'example' ? '예시로 만든 요청문' : '내 AI에게 보낼 요청문'}</span><button type="button" onClick={() => copy(prompt)}><Copy size={16}/>복사</button></div><textarea ref={promptRef} aria-label="AI에게 보낼 요청문" readOnly value={prompt}/></div>
            <details className={s.exampleDetails}><summary>이렇게 나올 수 있어요 <span>시연용 예시</span><ChevronDown size={16}/></summary><p>{content.example.before}</p><small>위 예시 상황으로 준비한 결과입니다. 내 AI의 실제 답변은 달라질 수 있어요.</small></details>
            <div className={s.actions}>{state.mode === 'example' ? <><button type="button" className={s.primary} onClick={() => {update({step: 5, experience: 'example-viewed'});}}>다듬는 과정도 보기<ArrowRight size={18}/></button><button type="button" className={s.textLink} onClick={() => go(2)}>내 일로 바꿔보기</button></> : nav(4, '복사한 요청문, 내 AI로 가져가기')}</div>
          </>}
        </>}

        {step === 4 && <>
          {title('04 / OVER TO YOUR AI', <>익숙한 AI에게<br/><em>첫 일을 맡겨보세요.</em></>, '새 프로그램을 설치할 필요 없어요. 평소 쓰는 AI 대화창에 붙여넣고, 답변을 받은 뒤 이곳으로 돌아오세요.')}
          <ol className={s.steps}><li><span>1</span><div><strong>요청문을 복사해요</strong><button type="button" className={s.textLink} onClick={() => copy(prompt)}><Copy size={15}/>요청문 다시 복사</button></div></li><li><span>2</span><div><strong>내 AI를 열어 붙여넣어요</strong><div className={s.aiLinks}><a href="https://chatgpt.com/" target="_blank" rel="noreferrer">ChatGPT<ArrowUpRight size={15}/></a><a href="https://claude.ai/new" target="_blank" rel="noreferrer">Claude<ArrowUpRight size={15}/></a></div><small>다른 AI도 괜찮아요. 이용 중인 계정으로 열어주세요.</small></div></li><li><span>3</span><div><strong>답변을 받으면, 이 탭으로 돌아와요</strong><small>캠퍼스에서는 내 AI의 대화 내용을 볼 수 없어요.</small></div></li></ol>
          <div className={s.actions}><button type="button" className={s.primary} disabled={!prompt} onClick={() => {update({experience: 'self-reported', step: 5}); setNotice('');}}>답변을 받았어요<Check size={18}/></button><button type="button" className={s.textLink} onClick={() => {update({mode: 'example', experience: 'example-viewed', step: 5});}}>지금은 예시로 살펴볼게요</button></div>
          <details className={s.exampleDetails}><summary>복사가 잘 안 되나요?<ChevronDown size={16}/></summary><textarea ref={promptRef} readOnly aria-label="직접 복사할 요청문" value={prompt}/><p>요청문을 전체 선택해 복사할 수 있어요. 카톡 안에서 AI가 열리지 않으면 브라우저의 ‘다른 브라우저로 열기’를 이용해 주세요.</p></details>
        </>}

        {step === 5 && <>
          {title('05 / A LITTLE MORE YOU', <>첫 답변은 출발점.<br/><em>한 번만 더, 내 쪽으로.</em></>, state.mode === 'example' ? '같은 결과도 어떤 기준을 더하느냐에 따라 달라져요. 준비한 예시의 수정 전후를 살펴봐요.' : '받은 답변에서 아쉬운 점 하나를 골라보세요. 고쳐달라고 말하는 것도 일을 맡기는 과정이에요.')}
          {state.mode === 'example' ? <div className={s.beforeAfter}><span className={s.paperCaption}>시연용 예시</span><div><small>첫 초안</small><p>{content.example.before}</p></div><div className={s.editRequest}><span>이렇게 요청했어요</span><p>“{content.example.revision}”</p></div><div><small>기준을 더한 뒤</small><p>{content.example.after}</p></div></div> : <><div className={s.revisionChoices}>{revisionOptions.map(option => <button type="button" key={option.id} aria-pressed={state.revision === option.id} onClick={() => update({revision: option.id})}>{option.label}{state.revision === option.id && <Check size={15}/>}</button>)}</div>{state.revision === 'different' && <label className={s.extraLabel}>내 상황과 다른 부분<textarea rows={2} maxLength={300} value={state.extra} onChange={e => update({extra: e.target.value})} placeholder="예: 고객은 부모님인데, 선생님을 위한 글처럼 나왔어요."/></label>}<div className={s.brief}><div className={s.briefHead}><span>같은 AI 대화에 이어서 보내세요</span><button type="button" disabled={!revision} onClick={() => copy(revision)}><Copy size={16}/>복사</button></div><textarea ref={promptRef} className={s.revisionText} aria-label="결과를 다듬을 요청문" readOnly value={revision || '어떤 부분이 다른지 위에 적어주세요.'}/></div><ul className={s.checks}>{content.checks.map(check => <li key={check}><Check size={16}/>{check}</li>)}</ul></>}
          <div className={s.actions}>{nav(6, '오늘 발견한 기준 챙기기')}{state.mode === 'example' && <button type="button" className={s.textLink} onClick={() => go(2)}>내 일로 직접 해보기</button>}</div>
        </>}

        {step === 6 && <>
          {title('06 / KEEP YOUR STANDARD', <>AI가 기억할 것은,<br/><em>내가 일하는 기준.</em></>, '오늘 적은 내용을 모아봤어요. 이런 기준이 쌓이면, AI 직원들이 함께 참고할 ‘우리 사업 매뉴얼’의 시작이 됩니다.')}
          <div className={s.criteria}><span className={s.paperCaption}>{state.mode === 'example' ? '예시로 살펴본 기준' : '내가 알려준 기준'} · 작은 매뉴얼의 첫 장</span>{criteria.map(item => <div key={item.label}><span>{item.label}</span><p>{item.value}</p></div>)}<button type="button" className={s.textLink} onClick={() => copy(criteria.map(x => `${x.label}: ${x.value}`).join('\n'))}><Copy size={15}/>기준 복사하기</button></div>
          <div className={s.people}><span className={s.eyebrow}>WHO YOU’LL LEARN WITH</span><h2>도구만 소개하고<br/>끝내지 않을게요.</h2><p>문샷에서는 일을 맡길 자료를 정리하고, 결과를 확인하고, 내 기준을 더하는 과정을 함께 배워요. 강사 윤익님과 브랜디액션 팀이 그 과정을 안내합니다.</p><p>라이브에서는 오늘의 작은 요청이 어떻게 반복해서 맡길 수 있는 업무가 되는지 살펴볼 거예요.</p></div>
          {nav(7, '라이브 홀에서 다음 이야기 보기')}
        </>}

        {step === 7 && <>
          {title('07 / SAVE YOUR NEXT STEP', <>작은 결과 다음엔,<br/><em>함께 일하는 방법.</em></>, content.bridge)}
          <div className={s.ticket}><div className={s.ticketTop}><span>MOONSHOT · LIVE CLASS</span><span className={s.liveDot}/></div><div className={s.ticketDate}><strong>12.07</strong><div>월요일<br/><b>오후 9:00</b><small>한국 시간</small></div></div><hr/><h2>내 기준을 아는<br/>AI 직원 만들기</h2><p>요청할 때마다 다시 설명하던 일을,<br/>자료와 기준을 참고하며 이어서 일하도록.</p><ul><li><span>01</span>AI가 내 일을 이해하도록 자료 정리하기</li><li><span>02</span>결과를 보고 내 기준으로 다듬기</li><li><span>03</span>텔레그램으로 일을 맡기는 흐름 살펴보기</li></ul><div className={s.ticketFoot}>유튜브 라이브 · 링크는 카톡방에서 안내해 드려요.</div></div>
          <div className={s.calendarActions}>{calendarLink ? <a href={calendarLink} target="_blank" rel="noreferrer" className={s.primary} onClick={() => setNotice('구글 캘린더에서 일정 내용을 확인한 뒤 저장을 눌러주세요.')}><CalendarDays size={18}/>구글 캘린더에 담기<ArrowUpRight size={16}/></a> : <span className={s.note}>일정 저장을 준비하고 있어요.</span>}<button type="button" className={s.secondary} onClick={saveCalendar} disabled={!calendarIcs(liveEvent)}><CalendarDays size={18}/>아이폰·다른 캘린더</button></div>
          <p className={s.fine}>캘린더가 열리면 ‘저장’ 또는 ‘추가’를 눌러주세요. 종료 시각은 추후 안내되며, 저장만으로 라이브에 자동 접속되지는 않아요.</p>
          <details className={s.exampleDetails}><summary>라이브 전에 다시 해볼까요?<ChevronDown size={16}/></summary><p>내 요청문과 진행한 위치는 같은 브라우저에서 다시 열 수 있어요. 다른 AI나 새로운 일로 한 번 더 시도해도 좋아요.</p><button type="button" className={s.textLink} onClick={() => go(2)}>내 체험 사무실로 돌아가기<ArrowRight size={16}/></button></details>
        </>}
        {copyFallback && <div className={s.manualCopy}><p>직접 복사하기</p><textarea aria-label="직접 복사할 내용" readOnly value={copyFallback}/><button type="button" className={s.textLink} onClick={() => setCopyFallback('')}>복사했어요 · 닫기<Check size={15}/></button></div>}
      </div>

      <aside className={s.world} aria-label={`${chapters[chapter]} 공간 미리보기`}>
        <div className={s.worldBar}><span><MapPin size={14}/>{chapters[chapter]}</span><span>{sceneReady ? '둘러볼 수 있어요' : '공간을 준비하고 있어요'}</span></div>
        <div className={s.sceneWrap}><ArrivalScene room={room} onReady={setSceneReady} onAction={id => {if(id === 'live:calendar')go(7);else if(id === 'welcome:begin')go(1);else if(id === 'office:request')go(2);else if(id === 'office:demo'){setDemo(1);go(1);}}}/><div className={s.sceneCaption}><span>{chapter === 0 ? 'YOUR NEXT CHAPTER' : chapter === 1 ? 'A DESK FOR YOUR IDEAS' : 'SEE YOU ON DECEMBER 7'}</span><strong>{chapter === 0 ? '이곳에서 시작해요.' : chapter === 1 ? '오늘, 일 하나를 맡겨봐요.' : '다음 이야기는 라이브에서.'}</strong></div></div>
        <div className={s.worldBottom}><p>{chapter === 1 ? '체험용 사무실 · 시연용 직원과 결과' : '버튼으로 이동해도, 공간을 둘러봐도 좋아요.'}</p><button type="button" onClick={() => setExplore(!explore)}>{explore ? '안내와 함께 보기' : '공간 크게 보기'}<ArrowUpRight size={15}/></button></div>
        <div className={s.nextPlace}><div><span>NEXT STOP</span><strong>{chapter === 0 ? '내 첫 AI 사무실' : chapter === 1 ? '12월 7일 라이브 홀' : '오늘 만든 결과, 내 일에 써보기'}</strong></div><button type="button" aria-label={chapter === 0 ? '체험 사무실로 이동' : chapter === 1 ? '라이브 홀로 이동' : '체험으로 돌아가기'} onClick={() => go(chapter === 0 ? 1 : chapter === 1 ? 7 : 2)}><ArrowRight size={22}/></button></div>
      </aside>
    </section>

    <div role="status" aria-live="polite" className={notice ? s.notice : s.quiet}>{notice}</div>
    <footer className={s.footer}><span>BRANDYACTION × MOONSHOT</span><span>{storageBlocked ? '브라우저 저장을 사용할 수 없어, 나가면 입력이 사라질 수 있어요.' : '내 입력과 진행 위치는 이 브라우저에만 저장돼요.'}</span><button type="button" onClick={() => setShowReset(true)}><RotateCcw size={13}/>처음부터</button></footer>
    <dialog ref={resetDialog} className={s.resetDialog} aria-labelledby="arrival-reset-title" onCancel={() => setShowReset(false)} onClose={() => setShowReset(false)}><div><button type="button" className={s.dialogClose} aria-label="닫기" onClick={() => setShowReset(false)}><X size={20}/></button><h2 id="arrival-reset-title">처음부터 다시 볼까요?</h2><p>이 브라우저에 적은 내용과 진행 위치를 지웁니다. 내 AI의 대화는 그대로예요.</p><div className={s.actions}><button type="button" className={s.secondary} onClick={() => setShowReset(false)}>계속 둘러보기</button><button type="button" className={s.primary} onClick={reset}>지우고 처음부터</button></div></div></dialog>
  </main>;
}
