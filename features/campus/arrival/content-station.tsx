import {useEffect, useId, useRef, useState} from 'react';
import {ArrowRight, ArrowUpRight, ChevronDown, Copy, MessageSquareText} from 'lucide-react';
import {buildContentExperiencePrompt, buildContentStationPrompt, contentStationReady, CONTENT_EXPERIENCE_LIMIT, CONTENT_STATION_EXAMPLE, CONTENT_STATION_LIMITS, type ContentStationDraft, type ContentStationInputs} from './content-station-prompt';
import monitor from './office-demo.module.css';
import styles from './content-station.module.css';

const captions = ['마스크팩, 붙이고 자도 될까요?', '우리 제품의 권장 사용 시간 10~15분', '사용 전, 제품의 사용 가이드를 확인하세요.'];
const paths = [{id:'product', label:'소개할 상품이 있어요'}, {id:'experience', label:'아직 사업을 시작하지 않았어요'}] as const;

export function ContentStation({draft, onDraftChange, onComplete, revisit = false}: {
  draft: ContentStationDraft;
  onDraftChange: (draft: ContentStationDraft) => void;
  onComplete: () => void;
  revisit?: boolean;
}) {
  const {path, inputs, experience} = draft;
  const productPath = path === 'product';
  const prompt = productPath
    ? draft.requestReady ? buildContentStationPrompt(inputs) : ''
    : draft.experienceRequestReady ? buildContentExperiencePrompt(experience) : '';
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
    if (!eligible) return;
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
              aria-label="마스크팩 사용 시간을 알려주는 광고 예시" aria-describedby={transcriptId}
              onTimeUpdate={event => {const time = event.currentTarget.currentTime; setCaption(time < 4 ? 0 : time < 9 ? 1 : 2);}}/>
            <span className={styles.badge}>AI만으로 제작한 영상</span>
            <p className={styles.cue} aria-hidden="true">{captions[caption]}</p>
          </div>
          <figcaption>가상 상품 광고예요. 기존 AI 영상에 고객이 궁금해한 사용 시간을 넣었어요.</figcaption>
          <span id={transcriptId} className={styles.visuallyHidden}>무음 영상의 자막. {captions.join(' / ')}</span>
        </figure>

        <section className={styles.exercise} aria-labelledby={exerciseId}>
          <h3 id={exerciseId}>내 상황에 맞는 콘텐츠 기획해보기</h3>
          <div className={styles.paths} role="group" aria-label="내 상황 선택">
            {paths.map(option => <button key={option.id} type="button" aria-pressed={path === option.id} aria-controls={formId} onClick={() => {
              if (path !== option.id) changeDraft({path: option.id});
            }}>{option.label}</button>)}
          </div>
          {productPath ? <p>내 상품과 경쟁사를 적어보세요. 평소 쓰는 AI에 고객 후기를 살펴보고 광고 영상의 장면을 함께 짜 달라고 할 수 있어요.</p>
            : <div className={styles.experienceIntro}><h4>내가 해본 일이 첫 콘텐츠가 된다면?</h4><p>비슷한 경험을 콘텐츠로 풀어낸 사람을 찾아보고, 내가 직접 답할 수 있는 질문으로 첫 콘텐츠를 기획해보세요.</p></div>}
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
              <label>고객이 자주 묻는 것과 우리 상품의 특징 <small>선택</small>
                <textarea rows={3} maxLength={CONTENT_STATION_LIMITS.facts} value={inputs.facts} onChange={event => edit({...inputs, facts: event.target.value})} placeholder="예: 집에서 촬영이 가능한가요? 익숙한 집에서 촬영한 실제 사진을 보여줄 수 있어요."/>
              </label>
              <p className={styles.privacy}>공개할 수 있는 상품 정보만 적어주세요. 적은 상품 정보는 ‘내 AI 체험’에서도 가져올 수 있어요.</p>
            </> : <label>어떤 일을 해보셨나요? <small>필수</small>
              <textarea required rows={3} maxLength={CONTENT_EXPERIENCE_LIMIT} value={experience}
                onChange={event => changeDraft({experience: event.target.value, experienceRequestReady: false})} placeholder="예: 직장에서 신입 교육을 맡았어요."/>
            </label>}
            <button className={styles.primary} type="submit" disabled={!eligible}>{productPath ? 'AI에 보낼 말 만들기' : '첫 콘텐츠를 기획할 요청 만들기'}<ArrowRight size={16} aria-hidden="true"/></button>
          </form>
          {prompt && <div className={styles.result} key={path}>
            <h4 ref={resultHeading} tabIndex={-1}>{productPath ? 'AI에게 이 일을 맡겨보세요' : '첫 콘텐츠를 기획할 요청을 만들었어요'}</h4>
            <p>아래 내용을 복사해 평소 쓰는 AI의 새 대화에 붙여넣으세요.</p>
            <button className={styles.primary} type="button" onClick={() => void copyPrompt()}><Copy size={16} aria-hidden="true"/>보낼 말 복사</button>
            <p className={styles.status} role="status">{copy === 'copied' ? '복사했어요. 아래에서 AI를 열 수 있어요.' : copy === 'manual' ? '아래 내용을 직접 복사해 주세요.' : ''}</p>
            <div className={styles.aiLinks}>
              <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">ChatGPT 열기<ArrowUpRight size={14} aria-hidden="true"/></a>
              <a href="https://claude.ai/new" target="_blank" rel="noreferrer">Claude 열기<ArrowUpRight size={14} aria-hidden="true"/></a>
            </div>
            <details className={styles.text} ref={details}>
              <summary>보낼 말 보기<ChevronDown size={16} aria-hidden="true"/></summary>
              <textarea aria-label="AI에 보낼 말" readOnly ref={promptText} value={prompt} rows={9} spellCheck={false}/>
            </details>
          </div>}
        </section>
      </div>
    </div>
    <footer className={`${monitor.footer} ${styles.bridge}`}>
      <button className={styles.primary} data-secondary={!revisit && copy !== 'copied' || undefined} type="button" onClick={onComplete}>{revisit ? '자료 목록으로 돌아가기' : 'AI가 내 일을 기억하는 방법 보기'}<ArrowRight size={16} aria-hidden="true"/></button>
    </footer>
  </>;
}
