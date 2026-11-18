import {ArrowRight, ChevronDown} from 'lucide-react';
import {DEFAULT_OFFICE_DEMO, type OfficeDemoChoice, type OfficeDemoConfig} from './office-demo';
import styles from './office-demo.module.css';

export function AdMaterial({material, expanded = false}: {material: string; expanded?: boolean}) {
  return <details className={styles.material} open={expanded || undefined}>
    <summary>참고한 광고 자료<ChevronDown size={16} aria-hidden="true"/></summary>
    {material === DEFAULT_OFFICE_DEMO.material &&
      /* eslint-disable-next-line @next/next/no-img-element -- This local image is the storyboard paired with the default material. */
      <img src="/campus/arrival/moonshot-ad-scene.webp" alt="문샷 모집 광고에 등장하는 AI 직원들" loading="lazy"/>}
    <p>{material}</p>
  </details>;
}

export function FeedbackChoices({choices, onSelect}: {
  choices: OfficeDemoConfig['choices'];
  onSelect: (choice: OfficeDemoChoice) => void;
}) {
  return <fieldset className={styles.choices}>
    <legend>어떤 방향으로 고쳐볼까요?</legend>
    {choices.map((item, index) => <button key={index} type="button" onClick={() => onSelect(index === 0 ? 0 : 1)}>
      <span>{item.feedback}</span><ArrowRight size={18} aria-hidden="true"/>
    </button>)}
  </fieldset>;
}

export function CopyComparison({draft, revised, beforeLabel = '첫 문장', afterLabel = '수정한 문장 · 체험 예시'}: {
  draft: string;
  revised: string;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  return <div className={styles.comparison}>
    <div className={styles.previous}><p className={styles.caption}>{beforeLabel}</p><p>{draft}</p></div>
    <div className={styles.revision}><p className={styles.caption}>{afterLabel}</p><p className={styles.headline}>{revised}</p></div>
  </div>;
}
