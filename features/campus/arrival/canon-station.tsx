'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {ArrowRight, BookOpen, Bot, Check, ChevronDown, RotateCcw} from 'lucide-react';
import type {CanonPhase} from './model';
import monitor from './office-demo.module.css';
import styles from './canon-station.module.css';

const toneRule = '겁주는 말 없이, 처음 쓰는 사람도 쉽게 이해할 수 있게 설명해 주세요.';

const knowledge = [
  {name: '우리 고객', detail: '바쁜 직장인'},
  {name: '가격'},
  {name: '경쟁사'},
  {name: '말투', detail: '쉽게 · 겁주지 않기'},
  {name: '상품', detail: '보습 마스크팩'},
  {name: '사용법', detail: '10~15분 뒤 떼기'},
  {name: '고객 질문', detail: '붙이고 자도 될까?'},
  {name: '장점'},
  {name: '판매처'},
  {name: '고객 후기'},
  {name: '광고 문구', detail: '고객 질문 반영'},
  {name: '문의 답변', detail: '사용법 안내'},
] as const;

const exchanges = [
  {
    phase: 1,
    action: '누가 쓰는지 알려주기',
    request: '우리 고객은 바쁜 직장인이야. 퇴근 후 쉬는 시간에 팩을 사용해.',
    reply: '광고를 쓸 때 직장인이 퇴근해서 팩을 붙이는 모습을 떠올릴게요.',
    update: '퇴근 후 팩을 쓰는 직장인을 기억했어요.',
    connections: [[0, 4]],
  },
  {
    phase: 2,
    action: '자주 묻는 질문 알려주기',
    request: '팩 붙이고 자도 되냐고 자주 물어봐. 우리 제품은 10~15분 뒤 떼면 돼.',
    reply: '광고에도, 문의에 답할 때도 10~15분 뒤에 떼라는 안내를 넣을게요.',
    update: '두 직원이 같은 사용법을 참고해요.',
    connections: [[4, 5], [5, 6], [6, 10], [6, 11]],
  },
  {
    phase: 3,
    action: '어떤 말투로 쓸지 알려주기',
    request: toneRule,
    reply: '제품 사용 시간은 그대로 안내하고, 처음 쓰는 고객도 편하게 읽을 말투로 쓸게요.',
    update: '두 직원이 같은 자료와 말투를 써요.',
    connections: [[3, 10], [3, 11], [10, 11]],
  },
] as const;

const outputs = [
  {
    name: '광고 문구',
    before: '사용 시간을 꼭 지켜주세요. 마스크팩 권장 사용 시간은 10~15분입니다.',
    after: '퇴근 후 마스크팩으로 잠깐 쉬어가세요. 10~15분 뒤 떼어내 주세요.',
  },
  {
    name: '고객 문의 답변',
    before: '권장 사용 시간은 10~15분입니다. 사용 기준을 반드시 지켜주세요.',
    after: '이 팩은 10~15분 뒤 떼어내 주세요. 잠들기 전에 쓰시면 돼요.',
  },
] as const;

function Exchange({request, reply}: {request: string; reply: string}) {
  return <div className={styles.exchange}>
    <p className={styles.request}><strong>내가 알려준 내용</strong>{request}</p>
    <p className={styles.reply}><strong><Bot size={17} aria-hidden="true"/>직원의 답</strong>{reply}</p>
  </div>;
}

export function CanonStation({phase, onAdvance, onHall}: {
  phase: CanonPhase;
  onAdvance: (phase: CanonPhase) => void;
  onHall: () => void;
}) {
  const mapHeading = useId();
  const comparisonId = useId();
  const [showRevised, setShowRevised] = useState<boolean | null>(null);
  const applied = showRevised ?? (phase === 3);
  const current = phase ? exchanges[phase - 1] : null;
  const next = phase === 3 ? null : exchanges[phase];
  const history = exchanges.slice(0, phase);
  const connections = history.flatMap(exchange => [...exchange.connections]);
  const connected = new Set<number>(connections.flat());
  const body = useRef<HTMLDivElement>(null);
  const previews = useRef<HTMLDivElement>(null);
  const advanceButton = useRef<HTMLButtonElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const requestedPhase = useRef<CanonPhase | null>(null);

  useEffect(() => {
    if (requestedPhase.current !== phase) return;
    requestedPhase.current = null;
    if (phase === 3) resultsHeading.current?.focus();
    else advanceButton.current?.focus();
  }, [phase]);

  function changePhase(nextPhase: CanonPhase) {
    requestedPhase.current = nextPhase;
    if (nextPhase === 3 || nextPhase === 0) setShowRevised(null);
    onAdvance(nextPhase);
  }

  function toggleComparison() {
    setShowRevised(!applied);
    if (applied) return;
    requestAnimationFrame(() => {
      const panel = body.current;
      const heading = resultsHeading.current;
      const cards = previews.current;
      if (!panel || !heading || !cards) return;

      const panelBounds = panel.getBoundingClientRect();
      if (cards.getBoundingClientRect().bottom <= panelBounds.bottom) return;
      panel.scrollTop += heading.getBoundingClientRect().top - panelBounds.top - 14;
      heading.focus({preventScroll: true});
    });
  }

  return <>
    <div ref={body} className={`${monitor.body} ${styles.body}`}>
    <header className={styles.intro}>
      <h1>기준 한 줄로 두 직원의 답이 달라져요</h1>
      <p><span>고객 질문</span> “마스크팩을 붙이고 자도 되나요?”</p>
    </header>
    <div className={styles.rule}>
      <div>
        <p className={styles.ruleLabel}>두 직원에게 줄 기준</p>
        <p className={styles.ruleText}>{toneRule}</p>
      </div>
      <button
        className={styles.apply}
        type="button"
        aria-controls={comparisonId}
        data-applied={applied}
        onClick={toggleComparison}
      >
        {applied ? '바꾸기 전만 보기' : <>이 기준으로 다시 써보기<ArrowRight size={17} aria-hidden="true"/></>}
      </button>
    </div>
    <section id={comparisonId} className={styles.comparison} aria-label="광고 문구와 고객 답변 비교">
      <h2 ref={resultsHeading} tabIndex={-1}>
        {applied ? '두 직원이 이렇게 다시 썼어요' : '두 직원이 처음 쓴 문장'}
      </h2>
      <div ref={previews} className={styles.previews} data-applied={applied}>
        {outputs.map(output => <article key={output.name} className={styles.preview}>
          <h3>{output.name}</h3>
          <div className={styles.before}>
            {applied && <p className={styles.previewLabel}>바꾸기 전</p>}
            <p>{output.before}</p>
          </div>
          {applied && <div className={styles.after}>
            <p className={styles.previewLabel}><Check size={14} aria-hidden="true"/>바꾼 뒤</p>
            <p>{output.after}</p>
          </div>}
        </article>)}
      </div>
      <p className={styles.takeaway} role="status" aria-atomic="true">
        {applied && '10~15분은 그대로예요. 광고는 언제 쓰면 좋을지, 문의 답변은 언제 떼면 될지 알려줘요.'}
      </p>
    </section>
    <details className={styles.detail} onToggle={({target, currentTarget}) => {
      const panel = body.current;
      if (target !== currentTarget || !currentTarget.open || !panel) return;
      const bounds = currentTarget.getBoundingClientRect();
      const panelBounds = panel.getBoundingClientRect();
      if (bounds.bottom > panelBounds.bottom) panel.scrollTop += bounds.top - panelBounds.top - 14;
    }}>
      <summary><BookOpen size={19} aria-hidden="true"/><span>직원들이 참고한 자료와 대화 보기</span><ChevronDown size={16} aria-hidden="true"/></summary>
      <div className={styles.layout}>
        <section className={styles.map} aria-labelledby={mapHeading}>
          <header className={styles.mapHeader}>
            <h2 id={mapHeading}>직원들이 함께 보는 자료</h2>
            <p>우리 팀은 함께 쓰는 자료와 업무 기준을 모아 둔 곳을 ‘정본’이라고 불러요.</p>
          </header>
          <div className={styles.board}>
            <svg viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
              {connections.map(([from, to]) => <line key={`${from}-${to}`}
                x1={(from % 4) * 100 + 50} y1={Math.floor(from / 4) * 100 + 50}
                x2={(to % 4) * 100 + 50} y2={Math.floor(to / 4) * 100 + 50}
                vectorEffect="non-scaling-stroke"/>)}
            </svg>
            <ul className={styles.nodes}>
              {knowledge.map((node, index) => <li key={node.name} data-connected={connected.has(index)}>
                <span className={styles.node}>{node.name}{connected.has(index) && 'detail' in node && <small>{node.detail}</small>}</span>
              </li>)}
            </ul>
          </div>
          <p className={styles.update} role="status" aria-atomic="true">
            {current && <Check size={16} aria-hidden="true"/>}
            {current?.update ?? '아직 직원들에게 알려준 내용이 없어요.'}
          </p>
        </section>
        <section className={styles.example} aria-label="직원들에게 알려주기">
          <h2>직원들에게 알려주기</h2>
          {!current && <p className={styles.note}>버튼을 눌러 어떤 자료가 쓰이는지 확인해 보세요.</p>}
          {current && <Exchange request={current.request} reply={current.reply}/>}
          {next && <button className={styles.action} type="button" ref={advanceButton} onClick={() => changePhase(next.phase)}>
            {next.action}<ArrowRight size={17} aria-hidden="true"/>
          </button>}
          {phase > 1 && <details className={styles.history}>
            <summary>이전 대화 보기</summary>
            {history.slice(0, -1).map(exchange => <Exchange key={exchange.phase} request={exchange.request} reply={exchange.reply}/>)}
          </details>}
          {phase === 3 &&
            <button className={styles.replay} type="button" onClick={() => changePhase(0)}>
              <RotateCcw size={16} aria-hidden="true"/>처음부터 보기
            </button>
          }
        </section>
      </div>
    </details>
    </div>
    <footer className={`${monitor.footer} ${styles.hall}`} data-applied={applied}>
      <p>라운지에 업무 기준표를 준비했어요.</p>
      <button className={styles.hallLink} type="button" onClick={onHall}>
        웰컴 라운지로 가기<ArrowRight size={17} aria-hidden="true"/>
      </button>
    </footer>
  </>;
}
