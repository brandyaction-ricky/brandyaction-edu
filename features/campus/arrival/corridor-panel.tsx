import {useEffect, useId, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, Check, ChevronDown} from 'lucide-react';
import {welcomeCase} from './case-data';
import type {ArrivalConfig} from './config';
import {DEFAULT_OFFICE_DEMO, type OfficeDemoChoice} from './office-demo';
import {officeCaseContent} from './office-demo-case';
import {CopyComparison} from './office-demo-parts';
import type {SpyPhase} from './model';
import {SpyStation} from './spy-station';
import {ContentStation} from './content-station';
import monitor from './office-demo.module.css';
import styles from './corridor-panel.module.css';

type Station = 2 | 3 | 4 | 5;
type Props = {
  station: Station;
  config: ArrivalConfig;
  spyPhase: SpyPhase;
  onSpyAdvance: (phase: SpyPhase) => void;
  proposalSent: boolean;
  onProposal: () => void;
  ruleChoice?: OfficeDemoChoice | null;
  onRuleChoice?: (choice: OfficeDemoChoice) => void;
  onComplete: () => void;
  onClose: () => void;
};

const locations: Record<Station, string> = {
  2: '경쟁사 스파이', 3: '콘텐츠 담당자', 4: '정본 · 회사 업무 기준', 5: '고객 응대 직원',
};
function firstSentence(copy: string) {
  const paragraph = copy.trim().split('\n')[0];
  return paragraph.match(/^.*?[.!?。！？][”’」"']?(?=\s|$)/u)?.[0] ?? paragraph;
}

export function CorridorPanel({station, config, spyPhase, onSpyAdvance, proposalSent, onProposal, ruleChoice, onRuleChoice, onComplete, onClose}: Props) {
  const {draft, choices} = officeCaseContent(config.officeDemo ?? DEFAULT_OFFICE_DEMO);
  const {product, support} = welcomeCase;
  const [localChoice, setLocalChoice] = useState<OfficeDemoChoice | null>(null);
  const selected = ruleChoice === undefined ? localChoice : ruleChoice;
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const contentLabel = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const choicesRef = useRef<HTMLFieldSetElement>(null);
  const comparisonHeading = useRef<HTMLHeadingElement>(null);
  function focusInsidePanel(element?: HTMLElement | null) {
    const scroll = body.current;
    if (!element || !scroll) return;
    element.focus({preventScroll:true});
    scroll.scrollTop += element.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 14;
  }
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      body.current?.scrollTo({top: 0, behavior: 'instant'});
      (heading.current ?? contentLabel.current)?.focus({preventScroll: true});
    });
    return () => cancelAnimationFrame(frame);
  }, [station]);

  return <section className={`${monitor.monitor} ${styles.panel}`} aria-labelledby={headingId}>
    <header className={monitor.header}>
      <span id={station <= 3 ? headingId : undefined} ref={station === 3 ? contentLabel : undefined} tabIndex={station === 3 ? -1 : undefined}>{locations[station]}</span>
      <button type="button" className={monitor.leave} onClick={onClose}><ArrowLeft size={15} aria-hidden="true"/>복도로 돌아가기</button>
    </header>
    {station === 2 ? <SpyStation phase={spyPhase} onAdvance={onSpyAdvance} onComplete={onComplete}/> :
    <div className={monitor.body} ref={body}>
      {station !== 3 && <h2 id={headingId} ref={heading} tabIndex={-1}>{station === 4 ? '두 직원에게 같은 기준을 건네보세요.' : '이런 문의가 들어오면 어떻게 답할까요?'}</h2>}

      {station === 3 && <ContentStation onComplete={onComplete}/>}

      {station === 5 && <>
        <p className={monitor.lead}>{product}의 안내 자료를 바탕으로 구성한 문의·답변 예시입니다.</p>
        <div className={styles.exchange}>
          <div><h3>문의 예시</h3><p>{support.question}</p></div>
          <div><h3>응대 직원의 답변 예시</h3><p>{support.answer}</p></div>
        </div>
        <dl className={styles.notes}>
          <div><dt>문의에서 알게 된 점</dt><dd>{support.summary}</dd></div>
          <div><dt>상품 소개 페이지 담당자에게 전할 제안</dt><dd>{support.proposal}</dd></div>
        </dl>
        <p role="status" className={styles.after}>{proposalSent ? '체험 속 상품 소개 페이지 담당자에게 제안을 전달했어요.' : ''}</p>
      </>}

      {station === 4 && <>
        <p className={monitor.lead}>두 직원이 일을 시작할 때 함께 읽는 회사 기준을 ‘정본’이라고 해요. 이번에는 문샷 챌린지를 예로, 같은 기준이 소개글과 고객 답변에 어떻게 적용되는지 살펴보세요.</p>
        <fieldset className={styles.rules} ref={choicesRef}><legend>팀이 함께 쓸 기준</legend>
          {choices.map((item, i) => {
            const index: OfficeDemoChoice = i === 0 ? 0 : 1;
            return <button key={index} type="button" aria-pressed={selected === index} onClick={() => {
              if (ruleChoice === undefined) setLocalChoice(index);
              onRuleChoice?.(index);
              // Wait for the selected rule's results and sticky footer to be laid out.
              requestAnimationFrame(() => focusInsidePanel(comparisonHeading.current));
            }}><span>{item.rule}</span>{selected === index && <Check size={17} aria-hidden="true"/>}</button>;
          })}
        </fieldset>
        {selected !== null && <div className={styles.outputs} aria-live="polite">
          <h3 ref={comparisonHeading} tabIndex={-1} className={styles.resultTitle}>두 직원이 쓴 첫 문장</h3>
          <p className={styles.appliedRule}><span>적용한 기준</span> {choices[selected].rule}</p>
          <dl className={styles.openings}>
            <div><dt>기획·제작 직원의 소개글</dt><dd>{firstSentence(choices[selected].revised)}</dd></div>
            <div><dt>고객 응대 직원의 답변</dt><dd>{firstSentence(choices[selected].approvedAnswer)}</dd></div>
          </dl>
          <p className={styles.sharedRuleNote}>이 기준을 한곳에 두면, 직원마다 같은 설명을 반복하지 않아도 돼요.</p>
          <details key={selected} className={styles.fullComparison}><summary>수정 전후 전체 문장 보기<ChevronDown size={16} aria-hidden="true"/></summary>
            <h4>소개글</h4>
            <CopyComparison draft={draft} revised={choices[selected].revised} beforeLabel="기준을 적용하기 전 초안" afterLabel="기준을 적용한 소개글 · 예시"/>
            <h4>고객 문의 답변</h4>
            <CopyComparison draft={support.answer} revised={choices[selected].approvedAnswer} beforeLabel="기준을 적용하기 전 답변" afterLabel="기준을 적용한 답변 · 예시"/>
          </details>
          <button type="button" className={monitor.revisit} onClick={() => focusInsidePanel(choicesRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="false"]'))}><ArrowLeft size={16} aria-hidden="true"/>다른 기준 비교하기</button>
        </div>}
      </>}
    </div>}

    {station === 5 && !proposalSent && <footer className={monitor.footer}>
      <button className={monitor.primary} type="button" onClick={onProposal}>담당자에게 제안 전달하기<ArrowRight size={16} aria-hidden="true"/></button>
    </footer>}
    {((station === 4 && selected !== null) || (station === 5 && proposalSent)) && <footer className={monitor.footer}>
      <button className={monitor.primary} type="button" onClick={onComplete}>{station === 4 ? '고객 응대 직원 만나기' : '내 일로 해보기'}<ArrowRight size={16} aria-hidden="true"/></button>
    </footer>}
  </section>;
}
