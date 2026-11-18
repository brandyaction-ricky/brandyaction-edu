import {useEffect, useId, useRef, useState} from 'react';
import {ArrowRight, ArrowUpRight, ChevronDown, Copy, MessageSquareText} from 'lucide-react';
import {buildContentStationPrompt, CONTENT_STATION_EXAMPLE, type ContentStationInputs} from './content-station-prompt';
import styles from './content-station.module.css';

const emptyInputs: ContentStationInputs = {product: '', competitor: '', customer: '', facts: ''};
const captions = ['마스크팩, 붙이고 자도 될까요?', '우리 제품의 권장 사용 시간 10~15분', '사용 전, 제품의 사용 가이드를 확인하세요.'];

export function ContentStation({onComplete}: {onComplete: () => void}) {
  const [inputs, setInputs] = useState(emptyInputs);
  const [prompt, setPrompt] = useState('');
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [caption, setCaption] = useState(0);
  const copyVersion = useRef(0);
  const video = useRef<HTMLVideoElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const promptText = useRef<HTMLTextAreaElement>(null);
  const transcriptId = useId();
  const eligible = Boolean(inputs.product.trim() && inputs.competitor.trim());

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
    setInputs(next);
    setPrompt('');
    setCopy('idle');
  }

  function makePrompt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const builtPrompt = buildContentStationPrompt(inputs);
    if (!builtPrompt) return;
    copyVersion.current++;
    setCopy('idle');
    setPrompt(builtPrompt);
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

  return <div className={styles.station}>
    <div className={styles.chat}>
      <span className={styles.avatar} aria-hidden="true"><MessageSquareText size={17}/></span>
      <p>경쟁사 스파이에게 받은 내용으로<br/>콘텐츠를 제작했어요!</p>
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

    <section className={styles.exercise}>
      <h3>내 사업엔 어떻게 적용될 수 있을까?</h3>
      <p>간단하게 경쟁사 조사부터, 우리 상품에 적용할 프롬프트를 만들어보세요.</p>
      <form className={styles.fields} onSubmit={makePrompt}>
        <button className={styles.exampleButton} type="button" onClick={() => edit(CONTENT_STATION_EXAMPLE)}>마스크팩 예시 넣기</button>
        <label>상품·서비스 <small>필수</small>
          <input required maxLength={300} value={inputs.product} onChange={event => edit({...inputs, product: event.target.value})} placeholder="예: 반려동물 출장 사진 촬영"/>
        </label>
        <label>비교할 경쟁사 이름이나 링크 <small>필수</small>
          <input required maxLength={1200} value={inputs.competitor} onChange={event => edit({...inputs, competitor: event.target.value})} placeholder="경쟁사 이름 또는 홈페이지 주소"/>
        </label>
        <label>어떤 고객에게 필요한가요? <small>선택</small>
          <input maxLength={400} value={inputs.customer} onChange={event => edit({...inputs, customer: event.target.value})} placeholder="예: 낯선 장소에서 반려견이 긴장하는 보호자"/>
        </label>
        <label>고객 질문과 실제 상품 특징·사용 가이드 <small>선택</small>
          <textarea rows={3} maxLength={1800} value={inputs.facts} onChange={event => edit({...inputs, facts: event.target.value})} placeholder="예: 집에서 촬영이 가능한가요? 익숙한 집에서 촬영한 실제 사진을 보여줄 수 있어요."/>
        </label>
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
    </section>

    <section className={styles.bridge}>
      <h3>서로 다른 AI 직원이 같은 기준으로 일하려면?</h3>
      <p>조사와 제작을 맡은 직원 모두 같은 상품 사용 가이드를 봤어요. 다음 장소에서 회사 기준 하나가 두 직원의 답을 어떻게 바꾸는지 확인해 보세요.</p>
      <button className={styles.primary} type="button" onClick={onComplete}>내 사업을 아는 AI는 어떻게 만들까요?<ArrowRight size={16} aria-hidden="true"/></button>
    </section>
  </div>;
}
