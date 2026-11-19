'use client';

import {useEffect, useId, useRef} from 'react';
import {ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CornerDownRight, Monitor} from 'lucide-react';
import {type OfficeDemoChoice, type OfficeDemoConfig, type OfficeDemoPhase} from './office-demo';
import {AdMaterial, CopyComparison, FeedbackChoices} from './office-demo-parts';
import styles from './office-demo.module.css';

type Props = {
  config: OfficeDemoConfig;
  phase: OfficeDemoPhase;
  choice: OfficeDemoChoice;
  onPhaseChange: (phase: OfficeDemoPhase, choice: OfficeDemoChoice) => void;
  onPersonal: () => void;
  onClose: () => void;
};

const headings: Record<OfficeDemoPhase, string> = {
  draft: '광고 첫 문장을 검토해 주세요.',
  feedback: '요청에 맞춰 첫 문장을 바꿨어요.',
  approved: '다음 광고에도 이 기준을 씁니다.',
};

export function OfficeDemo({config, phase, choice, onPhaseChange, onPersonal, onClose}: Props) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const result = config.choices[choice];
  useEffect(() => {
    scroller.current?.scrollTo({top: 0, behavior: 'instant'});
    heading.current?.focus({preventScroll: true});
  }, [phase]);

  return <section className={styles.monitor} aria-labelledby={headingId}>
    <header className={styles.header}>
      <span><Monitor size={17} aria-hidden="true"/>광고 담당자의 모니터</span>
      <button className={styles.leave} type="button" onClick={onClose}><ArrowLeft size={15} aria-hidden="true"/>책상으로</button>
    </header>
    <div className={styles.body} ref={scroller}>
      <h1 ref={heading} id={headingId} tabIndex={-1}>{headings[phase]}</h1>
      {phase === 'draft' && <>
        <p className={styles.lead}>{config.brief}</p>
        <div className={styles.paper}>
          <p className={styles.caption}>첫 문장</p>
          <p className={styles.headline}>{config.draft}</p>
          <AdMaterial material={config.material}/>
        </div>
        <FeedbackChoices choices={config.choices} onSelect={index => onPhaseChange('feedback', index)}/>
        <p className={styles.note}>피드백을 누르면 체험용 수정안을 볼 수 있어요.</p>
      </>}
      {phase === 'feedback' && <>
        <p className={styles.request}><CornerDownRight size={17} aria-hidden="true"/><span>내 피드백<strong>{result.feedback}</strong></span></p>
        <CopyComparison draft={config.draft} revised={result.revised}/>
        <button className={styles.revisit} type="button" onClick={() => onPhaseChange('draft', choice)}><ArrowLeft size={16} aria-hidden="true"/>다른 피드백으로 비교하기</button>
      </>}
      {phase === 'approved' && <>
        <div className={styles.rule}>
          <p className={styles.ruleLabel}><BookOpen size={17} aria-hidden="true"/>업무 기준 보관함</p>
          <p className={styles.headline}>{result.rule}</p>
        </div>
        <details className={styles.approvedCopy}>
          <summary><span><Check size={17} aria-hidden="true"/>내가 승인한 광고 문장</span><ChevronDown size={17} aria-hidden="true"/></summary>
          <p>{result.revised}</p>
        </details>
        <p className={styles.team}>{config.teamNote}</p>
        <button className={styles.revisit} type="button" onClick={() => onPhaseChange('draft', choice)}><ArrowLeft size={16} aria-hidden="true"/>초안부터 다시 보기</button>
      </>}
    </div>
    {phase !== 'draft' && <footer className={styles.footer}>
      {phase === 'feedback'
        ? <button className={styles.primary} type="button" onClick={() => onPhaseChange('approved', choice)}>이 문장으로 승인하기<Check size={17} aria-hidden="true"/></button>
        : <button className={styles.primary} type="button" onClick={onPersonal}>내 업무로 해보기<ArrowRight size={17} aria-hidden="true"/></button>}
    </footer>}
  </section>;
}
