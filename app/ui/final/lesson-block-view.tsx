"use client";
/* eslint-disable @next/next/no-img-element -- Imported lesson images have author-selected external sources and unknown dimensions; do not proxy them through the Next image optimizer. */

import { AnswerFiles } from './lesson-answer-files';
import type { AnswerFileContext } from '@/lib/lesson-files';
import { useState } from 'react';
import { defaultBlockCompletion, fillBlockPrompt, type BlockAnswer, type LessonBlockAnswers, type PublicBlockDocument, type PublicLessonBlock } from '@/lib/lesson-blocks';
import { LessonText } from './lesson-text';
import { Video } from './primitives';
import { hasGuidedDefinition, isGuidedTool } from '@/lib/lesson-guided-tools';
import { LessonGuidedTool } from './lesson-guided-tool';
import { hasCalculatorDefinition, isCalculator } from '@/lib/lesson-calculators';
import { LessonCalculator } from './lesson-calculator';
import './lesson-blocks.css';

export type BlockGrade = { correct: number; total: number; passed: boolean; results: { id: string; answered: boolean; correct: boolean }[] };
const supported = new Set(['heading', 'subheading', 'text', 'video', 'audio', 'image', 'question', 'divider', 'link', 'prompt', 'prompt-generator', 'quiz']);
export function canRenderLessonBlocks(document: PublicBlockDocument) {
  return document.blocks.every(block => isGuidedTool(block.type) ? hasGuidedDefinition(block) : isCalculator(block.type) ? hasCalculatorDefinition(block) : supported.has(block.type) && (block.type !== 'question' || ['text', 'image', 'file'].includes(block.question?.kind || '')));
}
function mediaUrl(value?: string) {
  try { const url = new URL(value || ''); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
function stringValues(answer: BlockAnswer | undefined): Record<string, string> {
  return answer && typeof answer === 'object' ? Object.fromEntries(Object.entries(answer).filter(([, value]) => typeof value === 'string')) as Record<string, string> : {};
}

function CopyPrompt({ text }: { text: string }) {
  const [message, setMessage] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(text); setMessage('복사했습니다. 사용할 AI에 붙여 넣어 주세요.'); }
    catch { setMessage('자동 복사가 되지 않았습니다. 아래 내용을 선택해 복사해 주세요.'); }
  }
  return <div className="lb-prompt"><pre tabIndex={0}>{text}</pre><button type="button" className="btn small" onClick={() => void copy()}>프롬프트 복사</button><span role="status">{message}</span></div>;
}

function PromptGenerator({ block, answer, disabled, onChange }: { block: PublicLessonBlock; answer?: BlockAnswer; disabled: boolean; onChange: (value: BlockAnswer) => void }) {
  const [privateValues, setPrivateValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState(''), [error, setError] = useState('');
  const values = { ...stringValues(answer), ...privateValues };
  function generate() {
    const missing = block.fields?.find(field => field.required && !values[field.id]?.trim());
    if (missing) { setError(`‘${missing.label}’ 항목을 입력해 주세요.`); return; }
    setError(''); setResult(fillBlockPrompt(block.content || '', block.fields || [], values));
  }
  return <section className="lb-card" aria-label="프롬프트 생성기"><h3>프롬프트 생성기</h3>
    {(block.fields || []).map(field => <label className="lb-field" key={field.id}>
      <span>{field.label}{field.required ? ' (필수)' : ''}</span>
      {field.options?.length ? <select value={values[field.id] || ''} disabled={disabled} onChange={event => { setResult(''); if (field.sensitive) setPrivateValues(previous => ({ ...previous, [field.id]: event.target.value })); else onChange({ ...stringValues(answer), [field.id]: event.target.value }); }}><option value="">선택해 주세요</option>{field.options.map(option => <option key={option}>{option}</option>)}</select>
        : <input type={field.sensitive ? 'password' : 'text'} autoComplete="off" maxLength={20000} value={values[field.id] || ''} placeholder={field.placeholder} disabled={disabled} onChange={event => { setResult(''); if (field.sensitive) setPrivateValues(previous => ({ ...previous, [field.id]: event.target.value })); else onChange({ ...stringValues(answer), [field.id]: event.target.value }); }} />}
      {field.sensitive && <small>이 항목은 저장되지 않으며 화면을 닫으면 지워집니다.</small>}
    </label>)}
    <button type="button" className="btn" onClick={generate} disabled={disabled}>프롬프트 만들기</button>
    {error && <p role="alert">{error}</p>}{result && <CopyPrompt key={result} text={result} />}
  </section>;
}

function BlockQuiz({ block, answer, disabled, onChange, grade }: { block: PublicLessonBlock; answer?: BlockAnswer; disabled: boolean; onChange: (value: BlockAnswer) => void; grade?: (blockId: string) => Promise<BlockGrade> }) {
  const [result, setResult] = useState<BlockGrade | null>(null), [message, setMessage] = useState(''), [pending, setPending] = useState(false);
  const choices = answer && typeof answer === 'object' ? answer : {};
  async function check() {
    if (!grade) return;
    if (block.quiz?.questions.some(question => !Object.hasOwn(choices, question.id))) { setMessage('모든 문제에 답한 뒤 확인해 주세요.'); return; }
    setPending(true); setMessage('');
    try { setResult(await grade(block.id)); } catch (error) { setMessage((error as Error).message); }
    finally { setPending(false); }
  }
  return <section className="lb-card" aria-label={block.content || '확인 문제'}><h3>{block.content || '확인 문제'}</h3>
    {(block.quiz?.questions || []).map((question, index) => <fieldset key={question.id} disabled={disabled || pending}>
      <legend>{index + 1}. {question.prompt}</legend>
      {question.options.map((option, n) => <label className="lb-choice" key={n}><input type="radio" name={`${block.id}-${question.id}`} checked={choices[question.id] === n} onChange={() => { setResult(null); setMessage(''); onChange({ ...choices, [question.id]: n }); }} />{option}</label>)}
      {result && <p>{result.results.find(item => item.id === question.id)?.correct ? '정답입니다.' : '다시 살펴보세요.'}</p>}
    </fieldset>)}
    {grade && <button type="button" className="btn" disabled={disabled || pending} onClick={() => void check()}>{pending ? '확인 중…' : '답안 확인'}</button>}
    {message && <p role="alert">{message}</p>}{result && <p role="status">{result.total}문제 중 {result.correct}문제 정답 · {result.passed ? '통과' : '다시 도전해 보세요.'}</p>}
  </section>;
}

export function LessonBlockView({ document, values, onChange, readOnly = false, grade, fileContext, submissionId, onFilePending, onAnswerChange }: { fileContext?: AnswerFileContext; submissionId?: string; onFilePending?: (blockId: string, pending: boolean) => void; onAnswerChange?: (blockId: string, value: BlockAnswer) => void; document: PublicBlockDocument; values: LessonBlockAnswers; onChange: (values: LessonBlockAnswers) => void; readOnly?: boolean; grade?: (blockId: string) => Promise<BlockGrade> }) {
  function answer(id: string, value: BlockAnswer) { if (onAnswerChange) { onAnswerChange(id, value); return; } onChange({ ...values, blocks: { ...values.blocks, [id]: value } }); }
  return <div className="lesson-blocks">
    {document.blocks.map(block => {
      const url = mediaUrl(block.url), value = values.blocks[block.id];
      let content;
      switch (block.type) {
        case 'heading': content = <h2>{block.content}</h2>; break;
        case 'subheading': content = <h3>{block.content}</h3>; break;
        case 'text': content = <div className="reading-copy"><LessonText text={block.content || ''} /></div>; break;
        case 'divider': content = <hr />; break;
        case 'image': content = url && <figure>{/* Untrusted imported URLs never become raw HTML. */}<img loading="lazy" src={url} alt={block.alt || ''} />{block.content && <figcaption>{block.content}</figcaption>}</figure>; break;
        case 'audio': content = url && <figure><figcaption>{block.content || '음성 자료'}</figcaption><audio controls preload="none" src={url} aria-label={block.alt || '학습 음성'}><a href={url}>음성 파일 열기</a></audio></figure>; break;
        case 'video': content = url && <><Video url={url} />{block.content && <p>{block.content}</p>}</>; break;
        case 'link': content = url && <a href={url} target="_blank" rel="noopener noreferrer" className="lb-link">{block.content || url} ↗</a>; break;
        case 'prompt': content = <CopyPrompt text={block.content || ''} />; break;
        case 'question': content = block.question?.kind === 'text' ? <label className="lb-field lb-card"><span>{block.question.label}{block.question.required && (document.completion || defaultBlockCompletion).requireAnswers ? ' (필수)' : ''}</span><textarea rows={5} maxLength={20000} value={typeof value === 'string' ? value : ''} readOnly={readOnly} onChange={event => answer(block.id, event.target.value)} /></label> : <AnswerFiles block={block} answer={value} onChange={value => answer(block.id, value)} readOnly={readOnly} context={fileContext} submissionId={submissionId} onPending={onFilePending} />; break;
        case 'prompt-generator': content = <PromptGenerator block={block} answer={value} disabled={readOnly} onChange={value => answer(block.id, value)} />; break;
        case 'persona-generator':
        case 'landing-planner': content = <LessonGuidedTool block={block} answer={value} readOnly={readOnly} onChange={value => answer(block.id, value)} />; break;
        case 'recipe-calculator':
        case 'margin-calculator':
        case 'marketing-funnel': content = <LessonCalculator block={block} answer={value} readOnly={readOnly} onChange={value => answer(block.id, value)} />; break;
        case 'quiz': content = <BlockQuiz block={block} answer={value} disabled={readOnly} onChange={value => answer(block.id, value)} grade={grade} />; break;
        default: content = <p role="alert">이 학습 도구의 연결을 확인하고 있습니다.</p>;
      }
      return <div key={block.id} data-lesson-block={block.id}>{content}</div>;
    })}
    {document.checklist.length > 0 && <fieldset className="lb-card" disabled={readOnly}><legend>오늘의 체크리스트</legend>{document.checklist.map(item => <label className="lb-choice" key={item.id}><input type="checkbox" checked={values.checklist.includes(item.id)} onChange={event => onChange({ ...values, checklist: event.target.checked ? [...values.checklist, item.id] : values.checklist.filter(id => id !== item.id) })} />{item.label}{item.required ? ' (필수)' : ''}</label>)}</fieldset>}
  </div>;
}
