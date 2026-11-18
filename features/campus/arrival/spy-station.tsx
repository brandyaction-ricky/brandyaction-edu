import {useEffect, useId, useRef, useState} from 'react';
import {ArrowRight, ArrowUp, Bot} from 'lucide-react';
import {SPY_PHASES, type SpyPhase} from './model';
import monitor from './office-demo.module.css';
import styles from './spy-station.module.css';

const replies = {
  intro: {text: '경쟁사 조사해서 우리 상품에 보완할 거 찾아줘.', next: 'reviews'},
  reviews: {text: '응, 우리 상품도 확인해줘.', next: 'guide'},
  guide: {text: '응, 콘텐츠 담당자에게 전달해줘.', next: 'handed-off'},
} as const;
const REPLY_PAUSE_MS = 560;
type RequestPhase = keyof typeof replies;

const reviews = [
  {rating: 2, title: '오래 붙이면 더 좋은 줄 알았어요', opening: '좋으라고 한 시간 정도 붙였는데', quote: '오히려 얼굴이 당기는 느낌이에요.', ending: '얼마나 붙여야 하는 건가요?'},
  {rating: 3, title: '붙이고 자도 되나요?', opening: '에센스가 많이 남아 있어 그냥 자려고 했는데', quote: '언제 떼야 하는지 잘 모르겠어요.'},
] as const;

function BotMessage({children, target}: {children: React.ReactNode; target?: React.Ref<HTMLDivElement>}) {
  return <div className={styles.botRow} ref={target} tabIndex={-1}>
    <span className={styles.avatar}><Bot size={20} aria-hidden="true"/><span className={styles.screenReader}>경쟁사 스파이</span></span>
    <div className={styles.botMessage}>{children}</div>
  </div>;
}

function VisitorMessage({children}: {children: string}) {
  return <p className={styles.visitorMessage}><span className={styles.screenReader}>내 요청: </span>{children}</p>;
}

export function SpyStation({phase, onAdvance, onComplete}: {phase: SpyPhase; onAdvance: (phase: SpyPhase) => void; onComplete: () => void}) {
  const [pending, setPending] = useState<RequestPhase | null>(null);
  const shownPhase = pending ?? phase;
  const step = SPY_PHASES.indexOf(shownPhase);
  const reply = shownPhase === 'handed-off' ? null : replies[shownPhase];
  const sendDescription = useId();
  const body = useRef<HTMLDivElement>(null);
  const activeMessage = useRef<HTMLDivElement>(null);
  const typingMessage = useRef<HTMLDivElement>(null);
  const replyTimer = useRef<number | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = pending ? typingMessage.current : activeMessage.current;
      const transcript = body.current;
      if (!target || !transcript) return;
      if (!pending) target.focus({preventScroll: true});
      const offset = target.getBoundingClientRect().top - transcript.getBoundingClientRect().top;
      transcript.scrollTo({top: shownPhase === 'intro' && !pending ? 0 : transcript.scrollTop + offset - 14, behavior: 'instant'});
    });
    return () => cancelAnimationFrame(frame);
  }, [pending, shownPhase]);
  useEffect(() => () => {
    if (replyTimer.current !== null) window.clearTimeout(replyTimer.current);
  }, []);

  function sendMessage() {
    if (phase === 'handed-off' || replyTimer.current !== null) return;
    setPending(phase);
    replyTimer.current = window.setTimeout(() => {
      replyTimer.current = null;
      setPending(null);
    }, REPLY_PAUSE_MS);
    // Save the sent step before the visual pause so reopening skips only the typing indicator.
    onAdvance(replies[phase].next);
  }

  return <>
    <div className={`${monitor.body} ${styles.body}`} ref={body} role="region" aria-label="경쟁사 스파이와 나눈 대화">
      <p className={styles.context}>마스크팩 가상 사례 · 예시 대화</p>
      <div className={styles.transcript}>
        <BotMessage target={shownPhase === 'intro' ? activeMessage : undefined}>
          <p>저는 경쟁사 스파이입니다.<br/>경쟁사의 광고와 고객 반응을 조사해<br/><strong>우리 브랜드에 활용할 기회를 찾아드립니다.</strong></p>
        </BotMessage>
        {step >= 1 && <>
          <VisitorMessage>{replies.intro.text}</VisitorMessage>
          <BotMessage target={shownPhase === 'reviews' ? activeMessage : undefined}>
            <div className={styles.reviews} role="group" aria-label="가상 리뷰 재구성">
              <header><strong>상품 리뷰</strong><span>가상 리뷰 재구성</span></header>
              {reviews.map(item => <article key={item.rating} className={styles.review}>
                <div className={styles.rating}>
                  <span aria-hidden="true">{'★'.repeat(item.rating)}<span className={styles.emptyStars}>{'★'.repeat(5 - item.rating)}</span></span>
                  <span>별점 {item.rating}점</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.opening} <mark>{item.quote}</mark>{'ending' in item ? ` ${item.ending}` : ''}</p>
              </article>)}
            </div>
            <p>두 리뷰에 <strong>얼마나 붙여야 하는지 모르겠다</strong>는 불편이 공통으로 나타나요. 권장 사용 시간이 눈에 잘 띄는지 살펴볼 만합니다.</p>
            <p>우리 브랜드에서도 이런 불편을 줄일 방법을 찾아볼까요?</p>
          </BotMessage>
        </>}
        {step >= 2 && <>
          <VisitorMessage>{replies.reviews.text}</VisitorMessage>
          <BotMessage target={shownPhase === 'guide' ? activeMessage : undefined}>
            <p>이 가상 사례의 정본에서 상품 사용 가이드를 확인했어요.</p>
            <div className={styles.guide}>
              <span>회사 정본 · 상품 사용 가이드 예시</span>
              <strong>10~15분 사용 후 떼어내세요.</strong>
            </div>
            <p>권장 사용 시간을 영상 첫 부분에 넣으면, 고객이 설명을 찾아보지 않아도 언제 떼어야 하는지 바로 알 수 있어요.</p>
            <p><strong>이런 내용을 바로 콘텐츠로 만들 수 있을 것 같아요.</strong><br/>콘텐츠 담당자에게 전달해볼까요?</p>
          </BotMessage>
        </>}
        {step >= 3 && <>
          <VisitorMessage>{replies.guide.text}</VisitorMessage>
          <BotMessage target={activeMessage}>
            <p><strong>체험에서 콘텐츠 담당자에게 전달한 내용이에요.</strong></p>
            <dl className={styles.handoff}>
              <div><dt>고객의 불편</dt><dd>얼마나 오래 붙여야 하는지 모르겠음</dd></div>
              <div><dt>우리 상품의 기준</dt><dd>정본에 기록된 권장 사용 시간 10~15분</dd></div>
              <div><dt>맡긴 일</dt><dd>사용 시간을 알기 쉽게 보여주는 콘텐츠 만들기</dd></div>
            </dl>
          </BotMessage>
        </>}
        {pending && <>
          <VisitorMessage>{replies[pending].text}</VisitorMessage>
          <BotMessage target={typingMessage}>
            <div className={styles.typing} role="status">
              <span className={styles.screenReader}>답변을 작성 중이에요.</span>
              <span aria-hidden="true" className={styles.dots}><i/><i/><i/></span>
            </div>
          </BotMessage>
        </>}
      </div>
    </div>
    <footer className={`${monitor.footer} ${styles.footer}`}>
      {shownPhase === 'intro' && !pending && <p>아래 요청문을 보내 업무를 맡겨보세요.</p>}
      {reply
        ? <div className={styles.composer}>
          <span className={styles.messagePreview} aria-hidden="true">{!pending && reply.text}</span>
          <span className={styles.screenReader} id={sendDescription}>예시 메시지 보내기</span>
          <button className={styles.send} type="button" onClick={sendMessage} aria-label={reply.text} aria-describedby={sendDescription} aria-disabled={pending !== null || undefined}>
            <ArrowUp size={17} aria-hidden="true"/><span aria-hidden="true">보내기</span>
          </button>
        </div>
        : <button className={styles.action} type="button" onClick={onComplete}>콘텐츠 실제 제작해보기<ArrowRight size={17} aria-hidden="true"/></button>}
    </footer>
  </>;
}
