import {useEffect, useId, useRef, useState} from 'react';
import {ArrowRight, ArrowUpRight, ChevronDown, Copy, MessageSquareText} from 'lucide-react';
import {buildContentStationPrompt, contentStationReady, CONTENT_STATION_EXAMPLE, CONTENT_STATION_LIMITS, type ContentStationDraft, type ContentStationInputs} from './content-station-prompt';
import monitor from './office-demo.module.css';
import styles from './content-station.module.css';

const captions = ['마스크팩, 붙이고 자도 될까요?', '우리 제품의 권장 사용 시간 10~15분', '사용 전, 제품의 사용 가이드를 확인하세요.'];

export function ContentStation({draft, onDraftChange, onComplete, revisit = false}: {
  draft: ContentStationDraft;
  onDraftChange: (draft: ContentStationDraft) => void;
  onComplete: () => void;
  revisit?: boolean;
}) {
  const {inputs} = draft;
  const prompt = draft.requestReady ? buildContentStationPrompt(inputs) : '';
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [caption, setCaption] = useState(0);
  const [exerciseOpen, setExerciseOpen] = useState(() => draft.requestReady || Object.values(inputs).some(Boolean));
  const copyVersion = useRef(0);
  const video = useRef<HTMLVideoElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const promptText = useRef<HTMLTextAreaElement>(null);
  const transcriptId = useId();
  const eligible = contentStationReady(inputs);

  useEffect(() => {
    const media = video.current;
    return () => {media?.pause();};
  }, []);

  useEffect(() => {
    if (copy !== 'manual' || !details.current || !promptText.current) return;
    details.current.open = true;
    promptText.current.focus();
    promptText.current.select();
  }, [copy]);

  function edit(next: ContentStationInputs) {
    copyVersion.current++;
    onDraftChange({inputs: next, requestReady: false});
    setCopy('idle');
  }

  function makePrompt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eligible) return;
    copyVersion.current++;
    setCopy('idle');
    onDraftChange({inputs, requestReady: true});
    requestAnimationFrame(() => resultHeading.current?.focus());
  }

  async function copyPrompt() {
    const version = ++copyVersion.current;
    try {
      await navigator.clipboard.writeText(prompt);
      if (copyVersion.current === version) setCopy('copied');
    } catch {
      if (copyVersion.current === version) setCopy('manual');
    }
  }

  return <>
    <div className={monitor.body}>
      <div className={styles.station}>
        <div className={styles.chat}>
          <span className={styles.avatar} aria-hidden="true"><MessageSquareText size={17}/></span>
          <div>
            <h3>고객의 질문이 광고의 첫 장면이 됐어요</h3>
            <p>“얼마나 붙이면 되나요?”라는 질문으로 시작해, 설명서에 적힌 사용 시간 10~15분을 바로 보여줍니다.</p>
          </div>
        </div>

        <figure className={styles.example}>
          <div className={styles.film}>
            <video ref={video} src="/campus/arrival/mask-example-silent.mp4" muted playsInline controls preload="metadata"
              aria-label="기존 마스크팩 영상에 이번 기획 문구를 적용한 예시" aria-describedby={transcriptId}
              onTimeUpdate={event => {const time = event.currentTarget.currentTime; setCaption(time < 4 ? 0 : time < 9 ? 1 : 2);}}/>
            <span className={styles.badge}>AI만으로 제작한 영상</span>
            <p className={styles.cue} aria-hidden="true">{captions[caption]}</p>
          </div>
          <figcaption>가상 상품 사례입니다. 기존 AI 영상에 이번 기획 문구를 적용했어요.</figcaption>
          <span id={transcriptId} className={styles.visuallyHidden}>무음 영상의 자막. {captions.join(' / ')}</span>
        </figure>

        <details className={styles.exercise} open={exerciseOpen} onToggle={event => setExerciseOpen(event.currentTarget.open)}>
          <summary>내 상품으로도 해보기<ChevronDown size={16} aria-hidden="true"/></summary>
          <p>내 상품과 경쟁사를 적으면 평소 쓰는 AI에 보낼 조사·제작 요청문을 만들 수 있어요.</p>
          <form className={styles.fields} onSubmit={makePrompt}>
            <button className={styles.exampleButton} type="button" onClick={() => edit(CONTENT_STATION_EXAMPLE)}>마스크팩 예시 넣기</button>
            <label>상품·서비스 <small>필수</small>
              <input required maxLength={CONTENT_STATION_LIMITS.product} value={inputs.product} onChange={event => edit({...inputs, product: event.target.value})} placeholder="예: 반려동물 출장 사진 촬영"/>
            </label>
            <label>비교할 경쟁사 이름이나 링크 <small>필수</small>
              <input required maxLength={CONTENT_STATION_LIMITS.competitor} value={inputs.competitor} onChange={event => edit({...inputs, competitor: event.target.value})} placeholder="경쟁사 이름 또는 홈페이지 주소"/>
            </label>
            <label>어떤 고객에게 필요한가요? <small>선택</small>
              <input maxLength={CONTENT_STATION_LIMITS.customer} value={inputs.customer} onChange={event => edit({...inputs, customer: event.target.value})} placeholder="예: 낯선 장소에서 반려견이 긴장하는 보호자"/>
            </label>
            <label>고객 질문과 실제 상품 특징·사용 가이드 <small>선택</small>
              <textarea rows={3} maxLength={CONTENT_STATION_LIMITS.facts} value={inputs.facts} onChange={event => edit({...inputs, facts: event.target.value})} placeholder="예: 집에서 촬영이 가능한가요? 익숙한 집에서 촬영한 실제 사진을 보여줄 수 있어요."/>
            </label>
            <p className={styles.privacy}>공개할 수 있는 상품 정보만 적어주세요. 적은 상품 정보는 ‘내 AI 체험’에서도 가져올 수 있어요.</p>
            <button className={styles.primary} type="submit" disabled={!eligible}>프롬프트 만들기<ArrowRight size={16} aria-hidden="true"/></button>
          </form>
          {prompt && <div className={styles.result}>
            <h4 ref={resultHeading} tabIndex={-1}>내 사업에 적용할 프롬프트가 준비됐어요.</h4>
            <p>요청문을 복사해 평소 쓰는 AI의 새 대화에 붙여넣으세요.</p>
            <button className={styles.primary} type="button" onClick={() => void copyPrompt()}><Copy size={16} aria-hidden="true"/>프롬프트 복사</button>
            <p className={styles.status} role="status">{copy === 'copied' ? '복사했어요. 아래에서 AI를 열 수 있어요.' : copy === 'manual' ? '아래 요청문을 직접 복사해 주세요.' : ''}</p>
            <div className={styles.aiLinks}>
              <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">ChatGPT 열기<ArrowUpRight size={14} aria-hidden="true"/></a>
              <a href="https://claude.ai/new" target="_blank" rel="noreferrer">Claude 열기<ArrowUpRight size={14} aria-hidden="true"/></a>
            </div>
            <details className={styles.text} ref={details}>
              <summary>프롬프트 보기<ChevronDown size={16} aria-hidden="true"/></summary>
              <textarea aria-label="생성한 프롬프트" readOnly ref={promptText} value={prompt} rows={9} spellCheck={false}/>
            </details>
          </div>}
        </details>
      </div>
    </div>
    <footer className={`${monitor.footer} ${styles.bridge}`}>
      <button className={styles.primary} type="button" onClick={onComplete}>{revisit ? '자료 목록으로 돌아가기' : '정본에서 두 직원의 답 바꿔보기'}<ArrowRight size={16} aria-hidden="true"/></button>
    </footer>
  </>;
}
