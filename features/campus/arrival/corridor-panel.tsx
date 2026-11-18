import {useEffect, useId, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, Check, ExternalLink} from 'lucide-react';
import {welcomeCase} from './case-data';
import type {ArrivalConfig} from './config';
import {DEFAULT_OFFICE_DEMO, type OfficeDemoChoice, type OfficeDemoPhase} from './office-demo';
import {officeCaseContent} from './office-demo-case';
import {CopyComparison, FeedbackChoices} from './office-demo-parts';
import monitor from './office-demo.module.css';
import styles from './corridor-panel.module.css';

type Station = 1 | 2 | 3 | 4 | 5;
type Props = {
  station: Station;
  config: ArrivalConfig;
  review: {phase: OfficeDemoPhase; choice: OfficeDemoChoice};
  ruleChoice?: OfficeDemoChoice | null;
  onRuleChoice?: (choice: OfficeDemoChoice) => void;
  onReview: (phase: OfficeDemoPhase, choice: OfficeDemoChoice) => void;
  onComplete: () => void;
  onClose: () => void;
};

const locations: Record<Station, string> = {
  1: '팀장', 2: '조사 담당자', 3: '기획·제작 담당자', 4: '고객 응대 담당자', 5: '회사 업무 기준',
};
const nextActions: Record<Station, string> = {
  1: '조사 담당자 만나기', 2: '기획·제작 담당자 만나기', 3: '고객 응대 담당자 만나기',
  4: '회사 업무 기준 열기', 5: '내 일로 해보기',
};

function ProductionMedia() {
  const {artwork, video} = welcomeCase;
  return <div className={styles.media}>
    {artwork && <figure>
      <a href={artwork.src} target="_blank" rel="noopener noreferrer" aria-label={artwork.caption + ' 원본 크게 보기'}>
        {/* eslint-disable-next-line @next/next/no-img-element -- The approved campaign artwork is paired with its caption. */}
        <img src={artwork.src} alt={artwork.alt} loading="lazy"/>
      </a>
      <figcaption>{artwork.caption}</figcaption>
    </figure>}
    {video && <figure>
      <video controls playsInline preload="metadata" src={video.src} poster={video.poster} aria-label={video.caption}/>
      <figcaption>{video.caption}</figcaption>
    </figure>}
  </div>;
}

export function CorridorPanel({station, config, review, ruleChoice, onRuleChoice, onReview, onComplete, onClose}: Props) {
  const demo = config.officeDemo ?? DEFAULT_OFFICE_DEMO;
  const {greeting, brief, material, draft, choices} = officeCaseContent(demo);
  const revision = choices[review.choice];
  const {product, sources, observations, support} = welcomeCase;
  const [proposalSent, setProposalSent] = useState(false);
  const [localChoice, setLocalChoice] = useState<OfficeDemoChoice | null>(null);
  const selected = ruleChoice === undefined ? localChoice : ruleChoice;
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const approved = review.phase === 'approved';
  const showNext = (station !== 3 || approved) && (station !== 4 || proposalSent) && (station !== 5 || selected !== null);
  const titles: Record<Station, string> = {
    1: greeting,
    2: '어떤 말을 광고에 담을까요?',
    3: approved ? '이 소개글로 승인했어요.' : review.phase === 'feedback' ? '요청하신 방향으로 고쳐봤어요.' : '소개글의 첫 문장을 정해주세요.',
    4: '이런 문의가 들어오면 어떻게 답할까요?',
    5: '두 직원에게 같은 기준을 건네보세요.',
  };

  useEffect(() => {
    body.current?.scrollTo({top: 0, behavior: 'instant'});
    heading.current?.focus({preventScroll: true});
  }, [station, review.phase]);

  return <section className={`${monitor.monitor} ${styles.panel}`} aria-labelledby={headingId}>
    <header className={monitor.header}>
      <span>{locations[station]}</span>
      <button type="button" className={monitor.leave} onClick={onClose}><ArrowLeft size={15} aria-hidden="true"/>복도로 돌아가기</button>
    </header>
    <div className={monitor.body} ref={body}>
      <h2 id={headingId} ref={heading} tabIndex={-1}>{titles[station]}</h2>

      {station === 1 && <>
        <p className={monitor.lead}>오늘 살펴볼 상품은 {product}입니다. 실제 자료로 만든 광고를 보고, 내가 팀장이라면 어떻게 고칠지 한 번 골라보세요.</p>
        <ProductionMedia/>
        <h3 className={styles.subhead}>담당자들의 책상에 놓인 일</h3>
        <dl className={styles.deliverables}>
          <div><dt>조사</dt><dd>원문에서 광고에 담을 단서 찾기</dd></div>
          <div><dt>기획·제작</dt><dd>소개글과 광고 이미지·영상 검토하기</dd></div>
          <div><dt>고객 응대</dt><dd>문의에 답하고 상품 안내에 보탤 내용 찾기</dd></div>
        </dl>
      </>}

      {station === 2 && <>
        <p className={monitor.lead}>{product}에 관해 읽은 자료입니다. 원문에서 무엇을 확인했고, 무엇을 더 잘 설명해야 할지 살펴보세요.</p>
        <h3 className={styles.subhead}>읽은 자료와 출처</h3>
        {sources.map(source => <div key={source.label + source.text} className={styles.evidence}>
          <strong>{source.label}</strong><p>{source.text}</p>
          {source.url && <a className={styles.source} href={source.url} target="_blank" rel="noopener noreferrer">원문 열기<ExternalLink size={14} aria-hidden="true"/></a>}
        </div>)}
        {demo.material !== DEFAULT_OFFICE_DEMO.material && <div className={styles.evidence}><strong>담당자가 더 참고한 자료</strong><p>{demo.material}</p></div>}
        <h3 className={styles.subhead}>조사 담당자의 해석</h3>
        {observations.map(item => <dl key={item.observation} className={styles.notes}>
          <div><dt>읽고 알게 된 점</dt><dd>{item.observation}</dd></div>
          <div><dt>우리가 강조할 점</dt><dd>{item.emphasis}</dd></div>
        </dl>)}
      </>}

      {station === 3 && <>
        {review.phase === 'draft' && <>
          <dl className={styles.notes}>
            <div><dt>조사 담당자가 넘긴 자료</dt><dd>{material}</dd></div>
            <div><dt>조사 결과에서 고른 장점</dt><dd>{brief}</dd></div>
            <div><dt>이 장점을 담은 소개글 초안</dt><dd className={monitor.headline}>{draft}</dd></div>
          </dl>
          <details className={styles.creative}><summary>이 상품의 광고 이미지·영상 보기</summary><ProductionMedia/></details>
          <FeedbackChoices choices={choices} onSelect={index => onReview('feedback', index)}/>
        </>}
        {review.phase === 'feedback' && <>
          <p className={styles.feedback}>내가 선택한 피드백<strong>{revision.feedback}</strong></p>
          <CopyComparison draft={draft} revised={revision.revised}/>
          <button className={monitor.revisit} type="button" onClick={() => onReview('draft', review.choice)}><ArrowLeft size={16} aria-hidden="true"/>다른 피드백으로 비교하기</button>
        </>}
        {approved && <>
          <div className={monitor.rule}><p className={monitor.ruleLabel}><Check size={16} aria-hidden="true"/>내가 승인한 소개글</p><p className={monitor.headline}>{revision.revised}</p></div>
          <p className={styles.after}>{demo.teamNote === DEFAULT_OFFICE_DEMO.teamNote ? '다음 책상에서는 같은 상품을 두고 문의를 받은 직원이 어떻게 답하는지 살펴봅니다.' : demo.teamNote}</p>
        </>}
      </>}

      {station === 4 && <>
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

      {station === 5 && <>
        <p className={monitor.lead}>여러 직원이 일을 시작할 때 함께 읽는 회사 기준을 ‘정본’이라고 해요. 기준 한 줄을 골라 두 직원의 결과를 비교해 보세요.</p>
        {approved && <p className={monitor.lead}>앞서 소개글을 승인할 때 고른 기준은 ‘{revision.rule}’이었어요.</p>}
        <fieldset className={styles.rules}><legend>팀이 함께 쓸 기준</legend>
          {choices.map((item, i) => {
            const index: OfficeDemoChoice = i === 0 ? 0 : 1;
            return <button key={index} type="button" aria-pressed={selected === index} onClick={() => {
              if (ruleChoice === undefined) setLocalChoice(index);
              onRuleChoice?.(index);
            }}><span>{item.rule}</span>{selected === index && <Check size={17} aria-hidden="true"/>}</button>;
          })}
        </fieldset>
        {selected !== null && <div aria-live="polite" className={styles.outputs}>
          <h3 className={styles.subhead}>소개글이 이렇게 달라져요</h3>
          <CopyComparison draft={draft} revised={choices[selected].revised} beforeLabel="처음 소개글" afterLabel="기준을 적용한 소개글 · 예시"/>
          <h3 className={styles.subhead}>같은 기준을 적용한 문의 답변</h3>
          <CopyComparison draft={support.answer} revised={choices[selected].approvedAnswer} beforeLabel="처음 답변" afterLabel="기준을 적용한 답변 · 예시"/>
          <p className={styles.after}>다음에 일을 맡길 때도 이 기준을 함께 주면, 직원마다 원하는 방향을 처음부터 설명할 일이 줄어듭니다.</p>
        </div>}
      </>}
    </div>

    {station === 3 && review.phase === 'feedback' && <footer className={monitor.footer}>
      <button className={monitor.primary} type="button" onClick={() => onReview('approved', review.choice)}>이 문장으로 승인하기<Check size={16} aria-hidden="true"/></button>
    </footer>}
    {station === 4 && !proposalSent && <footer className={monitor.footer}>
      <button className={monitor.primary} type="button" onClick={() => setProposalSent(true)}>담당자에게 제안 전달하기<ArrowRight size={16} aria-hidden="true"/></button>
    </footer>}
    {showNext && <footer className={monitor.footer}>
      <button className={monitor.primary} type="button" onClick={onComplete}>{nextActions[station]}<ArrowRight size={16} aria-hidden="true"/></button>
    </footer>}
  </section>;
}
