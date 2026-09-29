"use client";

import { useEffect, useRef, useState } from 'react';
import type { BlockAnswer, PublicLessonBlock } from '@/lib/lesson-blocks';
import { buildLandingPrompt, buildPersonaPrompt, firstMissingGuidedAnswer, guidedToolFields, hasGuidedDefinition, isGuidedTool, LANDING_QUESTIONS, personaIdentity, Q4_1_MAP, Q4_OPTIONS } from '@/lib/lesson-guided-tools';
import './lesson-guided-tool.css';

type Props = { block: PublicLessonBlock; answer?: BlockAnswer; readOnly: boolean; onChange: (answer: BlockAnswer) => void };
function strings(answer?: BlockAnswer): Record<string, string> {
  return answer && typeof answer === 'object' ? Object.fromEntries(Object.entries(answer).filter(([, value]) => typeof value === 'string')) as Record<string, string> : {};
}

export function LessonGuidedTool(props: Props) {
  if (!hasGuidedDefinition(props.block)) return <p role="alert">이 학습 도구의 질문 버전을 확인하고 있습니다.</p>;
  return <GuidedTool key={`${props.block.id}:${props.block.toolVersion}`} {...props} />;
}

function GuidedTool({ block, answer, readOnly, onChange }: Props) {
  const type = isGuidedTool(block.type) ? block.type : 'persona-generator';
  const values = strings(answer), fields = guidedToolFields(type);
  const missing = firstMissingGuidedAnswer(type, values), complete = missing === -1;
  const [step, setStep] = useState(() => Math.max(0, missing));
  const [intro, setIntro] = useState(() => type === 'landing-planner' && !Object.values(values).some(v => v.trim()));
  const [showResult, setShowResult] = useState(complete);
  const [copyMessage, setCopyMessage] = useState('');
  const heading = useRef<HTMLHeadingElement>(null), output = useRef<HTMLTextAreaElement>(null);
  const isPersona = type === 'persona-generator';
  const title = isPersona ? '핵심 고객 페르소나 생성기' : '랜딩페이지 기획 문답';
  const field = fields[step];
  const branch = Q4_1_MAP[values.q4 as keyof typeof Q4_1_MAP];
  const label = !isPersona && field.id === 'q4_1' ? branch?.question || field.label : field.label;
  const placeholder = !isPersona && field.id === 'q4_1' ? branch?.placeholder || '' : field.placeholder;
  const sub = !isPersona ? LANDING_QUESTIONS.find(q => q.id === field.id)?.sub : '';
  const canAdvance = Boolean(values[field.id]?.trim() && (!field.options?.length || field.options.includes(values[field.id])));
  const resultVisible = readOnly || (showResult && complete);
  const prompt = complete ? (isPersona ? buildPersonaPrompt(values) : buildLandingPrompt(values)) : '';

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [step, intro, resultVisible]);
  function change(key: string, value: string) {
    if (readOnly) return;
    setCopyMessage('');
    // Branch changes and the cleared branch answer are one autosave snapshot.
    // Do not issue two stale updates which could lose either field.
    onChange({ ...values, [key]: value, ...(!isPersona && key === 'q4' && value !== values.q4 ? { q4_1: '' } : {}) });
  }
  function advance() {
    if (!canAdvance) return;
    if (step < fields.length - 1) setStep(step + 1);
    else if (complete) setShowResult(true);
    else setStep(missing);
  }
  function reset() {
    if (readOnly || !window.confirm('처음부터 다시 작성할까요? 이 도구의 현재 답변이 지워지고 빈 답변으로 저장됩니다.')) return;
    onChange({}); setStep(0); setShowResult(false); setIntro(!isPersona); setCopyMessage('');
  }
  async function copy() {
    try { await navigator.clipboard.writeText(prompt); setCopyMessage('복사했습니다. 클로드에 붙여 넣어 주세요.'); }
    catch { output.current?.focus(); output.current?.select(); setCopyMessage('자동 복사가 되지 않았습니다. 선택된 내용을 직접 복사해 주세요.'); }
  }

  return <section className="lb-card lb-guided" aria-label={title}>
    <header><h3>{title}</h3><p>{isPersona ? '15가지 질문으로 내 핵심 고객을 정의합니다.' : '10개 질문과 선택한 목적의 추가 질문으로 기획안 프롬프트를 만듭니다.'}</p></header>
    {block.content && <p className="reading-copy">{block.content}</p>}
    {!resultVisible && intro ? <div className="lbg-intro"><h4 ref={heading} tabIndex={-1}>고객에게 말하듯 편하게 적어주세요.</h4><p>답변을 모아 클로드에서 사용할 프롬프트로 만들 수 있습니다.</p><button type="button" className="btn primary" onClick={() => setIntro(false)}>시작하기</button></div>
      : !resultVisible ? <div>
        <div className="lbg-progress"><span>질문 {step + 1} / {fields.length}</span><progress max={fields.length} value={step + 1} aria-label="문답 진행" /></div>
        <h4 ref={heading} tabIndex={-1} id={`${block.id}-question`}>{label}</h4>
        {sub && <p>{sub}</p>}
        {field.options?.length ? <div className="lbg-options" role="group" aria-labelledby={`${block.id}-question`}>
          {field.options.map(option => <button type="button" key={option} className="btn" aria-pressed={values[field.id] === option} onClick={() => { change(field.id, option); if (isPersona && step < fields.length - 1) setStep(step + 1); }}>
            {!isPersona && field.id === 'q4' ? Q4_OPTIONS.find(o => o.value === option)?.label || option : option}
          </button>)}
        </div> : <textarea className="lbg-answer" rows={5} maxLength={20000} value={values[field.id] || ''} aria-labelledby={`${block.id}-question`} placeholder={placeholder} onChange={event => change(field.id, event.target.value)} />}
        <div className="lbg-actions">
          {(step > 0 || !isPersona) && <button type="button" className="btn" onClick={() => step > 0 ? setStep(step - 1) : setIntro(true)}>이전</button>}
          <button type="button" className="btn primary" disabled={!canAdvance} onClick={advance}>{step === fields.length - 1 ? isPersona ? '페르소나 생성하기' : '기획안 프롬프트 만들기' : '다음'}</button>
        </div>
      </div> : <div className="lbg-result">
        <h4 ref={heading} tabIndex={-1}>{complete ? isPersona ? '핵심 고객 페르소나' : '기획안 프롬프트가 완성됐습니다' : '작성한 답변'}</h4>
        {isPersona && complete && <p className="lbg-persona-name">{personaIdentity(values).emoji} {personaIdentity(values).name}</p>}
        <dl>{fields.map(f => <div key={f.id}><dt>{!isPersona && f.id === 'q4_1' ? branch?.question || f.label : f.label}</dt><dd>{values[f.id] || '아직 작성하지 않았습니다.'}</dd></div>)}</dl>
        {complete && <><p>아래 내용을 전체 복사해서 클로드(Claude)에 붙여 넣어 주세요.</p><textarea ref={output} className="lbg-output" readOnly rows={12} aria-label="완성된 프롬프트" value={prompt} /><button type="button" className="btn" onClick={() => void copy()}>전체 프롬프트 복사</button><p role="status">{copyMessage}</p></>}
        {!readOnly && <div className="lbg-actions"><button type="button" className="btn" onClick={() => { setShowResult(false); setStep(0); setIntro(false); setCopyMessage(''); }}>답변 수정하기</button><button type="button" className="btn" onClick={reset}>처음부터 다시하기</button></div>}
      </div>}
  </section>;
}
