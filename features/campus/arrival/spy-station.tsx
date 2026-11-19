import {useEffect, useId, useRef, useState} from 'react';
import {ArrowRight, ArrowUp, Bot} from 'lucide-react';
import {SPY_PHASES, type SpyPhase} from './model';
import monitor from './office-demo.module.css';
import styles from './spy-station.module.css';

const replies = {
  intro: {text: '경쟁사 마스크팩 후기를 보고, 우리 상품 안내에서 보완할 점을 찾아줘.', next: 'reviews'},
  reviews: {text: '응, 우리 상품도 확인해줘.', next: 'guide'},
  guide: {text: '응, 콘텐츠 담당자에게 전달해줘.', next: 'handed-off'},
} as const;
const REPLY_PAUSE_MS = 560;
const REVIEW_MESSAGE_PAUSE_MS = 360;
const REVIEW_MESSAGE_COUNT = 3;
type RequestPhase = keyof typeof replies;

const reviews = [
  {rating: 2, title: '오래 붙이면 더 좋은 줄 알았어요', opening: '좋으라고 한 시간 정도 붙였는데', quote: '오히려 얼굴이 당기는 느낌이에요.', ending: '얼마나 붙여야 하는 건가요?'},
  {rating: 3, title: '붙이고 자도 되나요?', opening: '에센스가 많이 남아 있어 그냥 자려고 했는데', quote: '언제 떼야 하는지 잘 모르겠어요.'},
] as const;

function BotMessage({children, part}: {children: React.ReactNode; part?: 'summary' | 'reviews' | 'analysis'}) {
  return <div className={styles.botRow} data-spy-reply={part}>
    <span className={styles.avatar}><Bot size={20} aria-hidden="true"/><span className={styles.screenReader}>경쟁사 스파이</span></span>
    <div className={styles.botMessage}>{children}</div>
  </div>;
}

function VisitorMessage({children}: {children: string}) {
  return <p className={styles.visitorMessage}><span className={styles.screenReader}>내 요청: </span>{children}</p>;
}

export function SpyStation({phase, onAdvance, onComplete}: {
  phase: SpyPhase;
  onAdvance: (phase: SpyPhase) => void;
  onComplete: () => void;
}) {
  const [pending, setPending] = useState<RequestPhase | null>(null);
  const [reviewMessages, setReviewMessages] = useState(0);
  const shownPhase = pending ?? phase;
  const step = SPY_PHASES.indexOf(shownPhase);
  const visibleReviews = step >= 1 ? REVIEW_MESSAGE_COUNT : reviewMessages;
  const reply = shownPhase === 'handed-off' ? null : replies[shownPhase];
  const sendDescription = useId();
  const body = useRef<HTMLDivElement>(null);
  const replyTimer = useRef<number | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const transcript = body.current;
      if (transcript) transcript.scrollTop = pending || shownPhase !== 'intro' ? transcript.scrollHeight : 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [pending, shownPhase, visibleReviews]);
  useEffect(() => () => {
    if (replyTimer.current !== null) window.clearTimeout(replyTimer.current);
  }, []);

  function sendMessage() {
    if (phase === 'handed-off' || replyTimer.current !== null) return;
    setPending(phase);
    function finishReply() {
      replyTimer.current = null;
      setPending(null);
    }
    function revealReviewMessage(count: number) {
      setReviewMessages(count);
      if (count === REVIEW_MESSAGE_COUNT) finishReply();
      else replyTimer.current = window.setTimeout(() => revealReviewMessage(count + 1), REVIEW_MESSAGE_PAUSE_MS);
    }
    replyTimer.current = window.setTimeout(phase === 'intro' ? () => revealReviewMessage(1) : finishReply, REPLY_PAUSE_MS);
    // Save the sent step before the visual pause so reopening skips only the typing indicator.
    onAdvance(replies[phase].next);
  }

  return <>
    <div className={`${monitor.body} ${styles.body}`} ref={body} role="region" aria-label="경쟁사 스파이와 나눈 대화">
      <p className={styles.context}>마스크팩 가상 사례 · 예시 대화</p>
      <div className={styles.transcript} role="log" aria-label="대화 메시지">
        <BotMessage>
          <p>저는 경쟁사 스파이입니다.<br/>경쟁사의 광고와 고객 반응을 조사해<br/><strong>우리 브랜드에 활용할 기회를 찾아드립니다.</strong></p>
        </BotMessage>
        {(step >= 1 || pending === 'intro') && <VisitorMessage>{replies.intro.text}</VisitorMessage>}
        {visibleReviews >= 1 && <BotMessage part="summary">
          <p><strong>경쟁사 리뷰를 살펴봤어요.</strong></p>
        </BotMessage>}
        {visibleReviews >= 2 && <BotMessage part="reviews">
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
        </BotMessage>}
        {visibleReviews >= 3 && <BotMessage part="analysis">
          <p>두 리뷰에 <strong>얼마나 붙여야 하는지 모르겠다</strong>는 불편이 공통으로 나타나요. 권장 사용 시간이 눈에 잘 띄는지 살펴볼 만합니다.</p>
          <p>우리 브랜드에서도 이런 불편을 줄일 방법을 찾아볼까요?</p>
        </BotMessage>}
        {step >= 2 && <>
          <VisitorMessage>{replies.reviews.text}</VisitorMessage>
          <BotMessage>
            <p>이 가상 사례의 정본(회사 기준을 모아둔 문서)에서 상품 사용법을 확인했어요.</p>
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
          <BotMessage>
            <p><strong>체험에서 콘텐츠 담당자에게 전달한 내용이에요.</strong></p>
            <dl className={styles.handoff}>
              <div><dt>고객의 불편</dt><dd>얼마나 오래 붙여야 하는지 모르겠음</dd></div>
              <div><dt>우리 상품의 기준</dt><dd>정본에 기록된 권장 사용 시간 10~15분</dd></div>
              <div><dt>맡긴 일</dt><dd>사용 시간을 알기 쉽게 보여주는 콘텐츠 만들기</dd></div>
            </dl>
          </BotMessage>
        </>}
        {pending && <>
          {pending !== 'intro' && <VisitorMessage>{replies[pending].text}</VisitorMessage>}
          <BotMessage>
            <div className={styles.typing} role="status">
              <span className={styles.screenReader}>답변을 작성 중이에요.</span>
              <span aria-hidden="true" className={styles.dots}><i/><i/><i/></span>
            </div>
          </BotMessage>
        </>}
      </div>
    </div>
    <footer className={`${monitor.footer} ${styles.footer}`}>
      {reply ? <div className={styles.composer}>
          <span className={styles.messagePreview} id={sendDescription}>{reply.text}</span>
          <button className={styles.send} type="button" onClick={sendMessage}
            aria-label={shownPhase === 'intro' ? '첫 요청 보내기' : reply.text}
            aria-describedby={shownPhase === 'intro' ? sendDescription : undefined} aria-disabled={pending !== null || undefined}>
            <ArrowUp size={17} aria-hidden="true"/><span aria-hidden="true">보내기</span>
          </button>
        </div>
        : <button className={styles.action} type="button" onClick={onComplete}>콘텐츠 담당자 열기<ArrowRight size={17} aria-hidden="true"/></button>}
    </footer>
  </>;
}
