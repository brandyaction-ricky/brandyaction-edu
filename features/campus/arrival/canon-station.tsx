'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {ArrowRight, Bot, Check, ChevronDown, Network, RotateCcw} from 'lucide-react';
import type {CanonPhase} from './model';
import monitor from './office-demo.module.css';
import styles from './canon-station.module.css';

const toneRule = '겁주는 말 없이, 처음 쓰는 사람도 쉽게 이해할 수 있게 설명해 주세요.';

const knowledge = [
  {name: '타겟', detail: '바쁜 직장인'},
  {name: '가격'},
  {name: '경쟁사'},
  {name: '브랜드', detail: '쉽게 · 겁주지 않기'},
  {name: '상품', detail: '보습 마스크팩'},
  {name: '사용법', detail: '10~15분 뒤 떼기'},
  {name: '고객 질문', detail: '붙이고 자도 될까?'},
  {name: '장점'},
  {name: '채널'},
  {name: '고객 후기'},
  {name: '콘텐츠', detail: '질문을 콘텐츠로'},
  {name: '고객응대', detail: '사용법 안내'},
] as const;

const exchanges = [
  {
    phase: 1,
    action: '고객부터 알려줘보기',
    request: '우리 고객은 바쁜 직장인이야. 퇴근 후 쉬는 시간에 팩을 사용해.',
    reply: '타겟과 상품을 연결했어요. 이제 퇴근 후 사용하는 상황으로 생각합니다.',
    update: '바쁜 직장인 ↔ 보습 마스크팩 · 퇴근 후 사용하는 상황',
    connections: [[0, 4]],
  },
  {
    phase: 2,
    action: '고객 질문도 알려주기',
    request: '팩 붙이고 자도 되냐고 자주 물어봐. 우리 제품은 10~15분 뒤 떼면 돼.',
    reply: '고객 질문에 사용법을 연결했어요. 콘텐츠 주제와 응대에도 함께 활용합니다.',
    update: '고객 질문 ↔ 사용법 ↔ 콘텐츠·고객응대',
    connections: [[4, 5], [5, 6], [6, 10], [6, 11]],
  },
  {
    phase: 3,
    action: '우리 브랜드의 기준도 알려주기',
    request: toneRule,
    reply: '브랜드의 표현 기준까지 연결했어요. 앞서 알려주신 고객과 사용법도 함께 참고합니다.',
    update: '고객 + 상품 + 사용법 + 브랜드 기준 → 우리 회사에 맞는 결과',
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
    <p className={styles.reply}><strong><Bot size={17} aria-hidden="true"/>정본에 반영한 내용</strong>{reply}</p>
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
  const applyButton = useRef<HTMLButtonElement>(null);
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
      const button = applyButton.current;
      const revisions = previews.current?.querySelectorAll(`.${styles.after}`);
      if (!panel || !button || !revisions?.length) return;

      // Keep the button in view when the two revised samples fit together.
      const panelBounds = panel.getBoundingClientRect();
      const available = button.getBoundingClientRect().top - panelBounds.top - 12;
      const both = revisions[revisions.length - 1].getBoundingClientRect().bottom - panelBounds.bottom + 12;
      const first = revisions[0].getBoundingClientRect().bottom - panelBounds.bottom + 12;
      const offset = both <= available ? both : first;
      if (offset > 0) panel.scrollTop += offset;
    });
  }

  return <div ref={body} className={`${monitor.body} ${styles.body}`}>
    <header className={styles.intro}>
      <h1>회사 기준 한 줄로, 두 직원의 문장이 바뀝니다</h1>
      <p>“팩 붙이고 자도 되나요?” 이 질문에 광고 담당자와 문의 담당자가 어떻게 답하는지 비교해 보세요.</p>
    </header>
    <div className={styles.rule}>
      <div>
        <p className={styles.ruleLabel}>공통 표현 기준</p>
        <p className={styles.ruleText}>“{toneRule}”</p>
      </div>
      <button
        className={styles.apply}
        type="button"
        ref={applyButton}
        aria-controls={comparisonId}
        data-applied={applied}
        onClick={toggleComparison}
      >
        {applied ? '적용 전만 보기' : <>두 직원에게 기준 적용하기<ArrowRight size={17} aria-hidden="true"/></>}
      </button>
    </div>
    <section id={comparisonId} className={styles.comparison} aria-label="광고 문구와 고객 답변 비교">
      <h2 ref={resultsHeading} tabIndex={-1}>
        {applied ? '같은 기준을 읽은 두 직원의 결과' : '두 직원이 처음 작성한 문장'}
      </h2>
      <div ref={previews} className={styles.previews}>
        {outputs.map(output => <article key={output.name} className={styles.preview}>
          <h3>{output.name}</h3>
          <div className={styles.before}>
            <p className={styles.previewLabel}>적용 전</p>
            <p>{output.before}</p>
          </div>
          {applied && <div className={styles.after}>
            <p className={styles.previewLabel}><Check size={14} aria-hidden="true"/>기준 적용 후</p>
            <p>{output.after}</p>
          </div>}
        </article>)}
      </div>
      <p className={styles.takeaway} role="status" aria-atomic="true">
        {applied && '권장 시간은 그대로예요. 광고는 일상 속 사용 장면을 보여주고, 문의 답변은 언제 떼면 되는지 바로 알려줘요.'}
      </p>
    </section>
    <footer className={styles.hall}>
      <div>
        <h2>내 일에도 쓸 업무 기준표를 받아가세요</h2>
        <p>웰컴 라운지에 회사 업무 기준표와 AI팀 설계도를 준비했어요.</p>
      </div>
      <button className={styles.hallLink} type="button" onClick={onHall}>
        웰컴 라운지로 가기<ArrowRight size={17} aria-hidden="true"/>
      </button>
    </footer>
    <details className={styles.detail}>
      <summary><span><Network size={17} aria-hidden="true"/>회사 지식 지도와 대화 보기</span><ChevronDown size={16} aria-hidden="true"/></summary>
      <div className={styles.layout}>
        <section className={styles.map} aria-labelledby={mapHeading}>
          <header className={styles.mapHeader}>
            <Network size={18} aria-hidden="true"/>
            <h2 id={mapHeading}>회사 지식 지도</h2>
            <span>{phase}/3</span>
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
            {current?.update ?? '아직 연결된 지식이 없어요.'}
          </p>
        </section>
        <section className={styles.example} aria-label="마스크팩 업무 기준을 정본에 알려주는 체험">
          <h2>정본에 알려주기</h2>
          <p className={styles.note}>마스크팩 예시로, 대화에서 알려준 기준이 어떻게 연결되는지 살펴보세요.</p>
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
  </div>;
}
