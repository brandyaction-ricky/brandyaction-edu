'use client';

import {useEffect, useId, useRef} from 'react';
import {ArrowRight, Bot, Check, Network, RotateCcw} from 'lucide-react';
import type {CanonPhase} from './model';
import monitor from './office-demo.module.css';
import styles from './canon-station.module.css';

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
    action: '고객 정보 알려주기',
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
    request: '겁주는 말은 쓰지 마. 처음 쓰는 고객도 이해할 수 있게 쉽게 알려줘.',
    reply: '브랜드의 표현 기준까지 연결했어요. 앞서 알려주신 고객과 사용법도 함께 참고합니다.',
    update: '고객 + 상품 + 사용법 + 브랜드 기준 → 우리 회사에 맞는 결과',
    connections: [[3, 10], [3, 11], [10, 11]],
  },
] as const;

const outputs = [
  {name: '콘텐츠 AI', text: '퇴근 후 팩을 붙인 채 잠들어도 될까요?\n10~15분 뒤 떼어내 주세요.\n사용법을 차근차근 알려드릴게요.'},
  {name: '고객응대 AI', text: '퇴근 후 쉬는 시간에 사용하시면 좋아요.\n이 제품은 10~15분 뒤 떼어내 주세요.\n처음 사용하신다면 쉽게 안내해드릴게요.'},
] as const;

function Exchange({request, reply}: {request: string; reply: string}) {
  return <div className={styles.exchange}>
    <p className={styles.request}><strong>예시로 알려준 기준</strong>{request}</p>
    <p className={styles.reply}><strong><Bot size={17} aria-hidden="true"/>정본에 반영한 내용</strong>{reply}</p>
  </div>;
}

export function CanonStation({phase, onAdvance, onHall}: {
  phase: CanonPhase;
  onAdvance: (phase: CanonPhase) => void;
  onHall: () => void;
}) {
  const mapHeading = useId();
  const mapHint = `${mapHeading}-hint`;
  const current = phase ? exchanges[phase - 1] : null;
  const next = phase === 3 ? null : exchanges[phase];
  const history = exchanges.slice(0, phase);
  const connections = history.flatMap(exchange => [...exchange.connections]);
  const connected = new Set<number>(connections.flat());
  const advanceButton = useRef<HTMLButtonElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const requestedPhase = useRef<CanonPhase | null>(null);

  useEffect(() => {
    if (requestedPhase.current !== phase) return;
    requestedPhase.current = null;
    if (phase === 3) resultsHeading.current?.focus();
    else advanceButton.current?.focus({preventScroll: phase !== 0});
  }, [phase]);

  function changePhase(nextPhase: CanonPhase) {
    requestedPhase.current = nextPhase;
    onAdvance(nextPhase);
  }

  return <div className={`${monitor.body} ${styles.body}`}>
    <header className={styles.intro}>
      <h1>AI들이 10배 더 똑똑하게 일할 수 있는 이유는 정본 때문이에요.</h1>
      <p>AI 직원이 각자 배운 내용은 서로 연결되어 있지 않아요. 정본을 쓰면 대화를 거듭할수록 지식이 연결되고, AI 직원들이 그 지식을 함께 활용할 수 있어요.</p>
      {next && <>
        <p>아래 버튼을 눌러 AI가 어떻게 학습하는지 확인해 보세요.</p>
        <button className={styles.action} type="button" ref={advanceButton} onClick={() => changePhase(next.phase)}>
          {next.action}<ArrowRight size={17} aria-hidden="true"/>
        </button>
      </>}
    </header>
    <div className={styles.layout}>
      <section className={styles.map} aria-labelledby={mapHeading} aria-describedby={mapHint}>
        <header className={styles.mapHeader}>
          <Network size={18} aria-hidden="true"/>
          <h2 id={mapHeading}>회사 지식 지도</h2>
          <span>{phase}/3</span>
        </header>
        <p className={styles.mapHint} id={mapHint}>
          {phase === 0 ? '대화에서 배운 내용이 여기에 하나씩 연결돼요.' : '정본이 대화에서 배운 내용을 파란색으로 연결해요.'}
        </p>
        <div className={styles.board}>
          <svg viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
            {connections.map(([from, to]) => <line key={`${from}-${to}`}
              x1={(from % 4) * 100 + 50} y1={Math.floor(from / 4) * 100 + 50}
              x2={(to % 4) * 100 + 50} y2={Math.floor(to / 4) * 100 + 50}
              vectorEffect="non-scaling-stroke"/>)}
          </svg>
          <ul className={styles.nodes} role="list">
            {knowledge.map((node, index) => <li key={node.name} data-connected={connected.has(index)}>
              <span className={styles.node}>
                <span className={styles.nodeName}>{node.name}</span>
                {connected.has(index) && 'detail' in node && <small>{node.detail}</small>}
              </span>
            </li>)}
          </ul>
        </div>
        <p className={styles.update} role="status" aria-atomic="true">
          {current && <Check size={16} aria-hidden="true"/>}
          {current?.update ?? '아직 연결된 지식이 없어요.'}
        </p>
      </section>
      <section className={styles.example} aria-label="마스크팩 업무 기준을 정본에 알려주는 체험">
        <h2>{current ? '정본과 나눈 대화' : '마스크팩 사례'}</h2>
        {current
          ? <Exchange request={current.request} reply={current.reply}/>
          : <p className={styles.note}>고객 정보, 제품 사용법, 브랜드 기준을 차례로 알려줄 거예요.</p>}
        {phase > 1 && <details className={styles.history}>
          <summary>이전 대화 보기</summary>
          {history.slice(0, -1).map(exchange => <Exchange key={exchange.phase} request={exchange.request} reply={exchange.reply}/>)}
        </details>}
        {phase === 3 && <section className={styles.results} aria-label="같은 기준을 활용한 업무 결과">
          <h3 ref={resultsHeading} tabIndex={-1}>같은 질문에 답이 어떻게 달라질까요?</h3>
          <p className={styles.customerQuestion}>“팩 붙이고 자도 되나요?” <span>체험용 예시</span></p>
          <div className={styles.comparison}>
            <div className={styles.withoutCanon}>
              <h4>정본 없이 답할 때</h4>
              <p>“오래 붙일수록 보습에 좋다고 해요.”</p>
              <small>제품의 사용법을 확인하지 않고 후기의 오해를 옮겼어요.</small>
            </div>
            <div className={styles.withCanon}>
              <h4>정본을 읽고 답할 때</h4>
              <p>“붙인 채로 잠들지 마세요. 이 팩은 10~15분 뒤 떼어내 주세요.”</p>
              <small>우리 제품의 사용 시간을 먼저 알려줘요.</small>
            </div>
          </div>
          <h3>같은 기준을 읽은 두 직원의 결과</h3>
          {outputs.map(output => <article key={output.name} className={styles.result}>
            <h4>{output.name}</h4>
            <p>{output.text}</p>
          </article>)}
          <button className={styles.replay} type="button" onClick={() => changePhase(0)}>
            <RotateCcw size={16} aria-hidden="true"/>처음부터 보기
          </button>
        </section>}
      </section>
    </div>
    {phase === 3 && <p className={styles.takeaway}>이야기를 나눌수록 우리 회사에 더 잘 맞는 AI가 됩니다.</p>}
    <footer className={styles.hall}>
      <div>
        <h2>12월 7일 라이브에서 이 전 과정을 알려드립니다.</h2>
        <p>웰컴 라운지에서 AI팀 설계도와 회사 업무 기준표를 받을 수 있어요.</p>
      </div>
      <button className={styles.hallLink} type="button" onClick={onHall}>
        웰컴 라운지로 가기<ArrowRight size={17} aria-hidden="true"/>
      </button>
    </footer>
  </div>;
}
