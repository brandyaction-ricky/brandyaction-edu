import {useEffect, useId, useRef, useState} from 'react';
import {ArrowRight, ArrowUpRight, ChevronDown, Copy, MessageSquareText} from 'lucide-react';
import {buildContentExperiencePrompt, buildContentStationPrompt, contentStationReady, CONTENT_EXPERIENCE_LIMIT, CONTENT_STATION_EXAMPLE, CONTENT_STATION_LIMITS, type ContentStationDraft, type ContentStationInputs} from './content-station-prompt';
import monitor from './office-demo.module.css';
import progression from './progression.module.css';
import styles from './content-station.module.css';

const captions = ['마스크팩, 붙이고 자도 될까요?', '우리 제품의 권장 사용 시간 10~15분', '사용 전, 제품의 사용 가이드를 확인하세요.'];

const paths = [
  {id: 'product', label: '소개할 상품이 있어요'},
  {id: 'experience', label: '아직 사업을 시작하지 않았어요'},
] as const;

export function ContentStation({draft, onDraftChange, onComplete, revisit = false}: {
  draft: ContentStationDraft;
  onDraftChange: (draft: ContentStationDraft) => void;
  onComplete: () => void;
  revisit?: boolean;
}) {
  const {path, inputs, experience, requestReady, experienceRequestReady} = draft;
  const productPath = path === 'product';
  const prompt = productPath
    ? (requestReady ? buildContentStationPrompt(inputs) : '')
    : (experienceRequestReady ? buildContentExperiencePrompt(experience) : '');
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [caption, setCaption] = useState(0);
  const copyVersion = useRef(0);
  const video = useRef<HTMLVideoElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const promptText = useRef<HTMLTextAreaElement>(null);
  const transcriptId = useId();
  const exerciseId = useId();
  const formId = useId();
  const eligible = productPath ? contentStationReady(inputs) : Boolean(experience.trim());

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

  function changeDraft(patch: Partial<ContentStationDraft>) {
    copyVersion.current++;
    setCopy('idle');
    onDraftChange({...draft, ...patch});
  }

  function edit(next: ContentStationInputs) {
    changeDraft({inputs: next, requestReady: false});
  }

  function makePrompt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eligible || prompt) return;
    changeDraft(productPath ? {requestReady: true} : {experienceRequestReady: true});
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
  <div className={`${monitor.body} ${styles.station}`}>
    <div className={styles.chat}>
      <span className={styles.avatar} aria-hidden="true"><MessageSquareText size={17}/></span>
      <p>경쟁사 스파이에게 받은 내용을 기존 AI 영상에 자막으로 넣어봤어요.</p>
    </div>

    <figure className={styles.example}>
      <div className={styles.film}>
        <video ref={video} src="/campus/arrival/mask-example-silent.mp4" muted playsInline controls preload="metadata"
          aria-label="기존 마스크팩 영상에 이번 기획 문구를 적용한 예시" aria-describedby={transcriptId}
          onTimeUpdate={event => {const time = event.currentTarget.currentTime; setCaption(time < 4 ? 0 : time < 9 ? 1 : 2);}}/>
        <span className={styles.badge}>AI만으로 제작한 영상</span>
        <p className={styles.cue} aria-hidden="true">{captions[caption]}</p>
      </div>
      <figcaption>가상 상품의 권장 사용 시간 10~15분을 영상 앞부분에 안내했어요.</figcaption>
      <span id={transcriptId} className={styles.visuallyHidden}>무음 영상의 자막. {captions.join(' / ')}</span>
    </figure>

    <section className={styles.exercise} aria-labelledby={exerciseId}>
      <h3 id={exerciseId}>내 상황에 맞는 콘텐츠 기획해보기</h3>
      <div className={styles.paths} role="group" aria-label="내 상황 선택">
        {paths.map(option => <button key={option.id} type="button" aria-pressed={path === option.id} aria-controls={formId}
          onClick={() => {if (path !== option.id) changeDraft({path: option.id});}}>{option.label}</button>)}
      </div>
      {productPath
        ? <p>내 상품과 경쟁사를 적으면 평소 쓰는 AI에 보낼 조사·제작 요청문을 만들 수 있어요.</p>
        : <div className={styles.experienceIntro}>
          <h4>나와 비슷한 경험을 가진 사람들은 어떤 콘텐츠를 만들고 있을까요?</h4>
          <p>해봤던 일을 하나 적어보세요. 비슷한 경험으로 콘텐츠를 만드는 사람을 찾아보고, 내 이야기로 시작할 첫 콘텐츠를 기획해볼 수 있어요.</p>
        </div>}
      <form id={formId} className={styles.fields} onSubmit={makePrompt}>
        {productPath ? <>
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
        </> : <label>어떤 일을 해보셨나요?
          <textarea required rows={3} maxLength={CONTENT_EXPERIENCE_LIMIT} value={experience}
            onChange={event => changeDraft({experience: event.target.value, experienceRequestReady: false})}
            placeholder="예: 직장에서 신입 교육을 많이 맡아 하고 있어요"/>
        </label>}
        {!prompt && <button className={styles.primary} type="submit" disabled={!eligible}>
          {productPath ? '요청문 만들기' : '내 첫 콘텐츠 기획 요청문 만들기'}<ArrowRight size={16} aria-hidden="true"/>
        </button>}
      </form>
      {prompt && <div className={styles.result} key={path}>
        <h4 ref={resultHeading} tabIndex={-1}>{productPath ? '내 사업에 적용할 요청문이 준비됐어요.' : '첫 콘텐츠를 기획할 요청문이 준비됐어요.'}</h4>
        <p>요청문을 복사해 평소 쓰는 AI의 새 대화에 붙여넣으세요.</p>
        <button className={styles.primary} type="button" onClick={() => void copyPrompt()}><Copy size={16} aria-hidden="true"/>요청문 복사</button>
        <p className={styles.status} role="status">{copy === 'copied' ? '복사했어요. 아래에서 AI를 열 수 있어요.' : copy === 'manual' ? '아래 요청문을 직접 복사해 주세요.' : ''}</p>
        <div className={styles.aiLinks}>
          <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">ChatGPT 열기<ArrowUpRight size={14} aria-hidden="true"/></a>
          <a href="https://claude.ai/new" target="_blank" rel="noreferrer">Claude 열기<ArrowUpRight size={14} aria-hidden="true"/></a>
        </div>
        <details className={styles.text} ref={details}>
          <summary>요청문 보기<ChevronDown size={16} aria-hidden="true"/></summary>
          <textarea aria-label="생성한 요청문" readOnly ref={promptText} value={prompt} rows={9} spellCheck={false}/>
        </details>
      </div>}
    </section>

  </div>
  <footer className={`${monitor.footer} ${styles.bridge}`}>
    {!revisit && <div>
      <p>다음. 4번째 봇을 확인해보세요.</p>
      <h3>AI 직원들이 10배 더 똑똑해지는 법</h3>
    </div>}
    <button className={revisit ? styles.returnButton : progression.nextAction} type="button" onClick={onComplete}>{revisit ? '자료 목록으로 돌아가기' : '회사 업무 기준 보기'}<ArrowRight size={16} aria-hidden="true"/></button>
  </footer>
  </>;
}
