/* eslint-disable @next/next/no-img-element -- local synthetic blob attachment */
'use client';
import {useEffect,useRef,useState,type FormEvent,type DragEvent,type ClipboardEvent} from 'react';
import {useCampusDraftGuard} from './draft-guard';
import type {CampusSnapshot} from '../contracts';
import s from '../support/panel.module.css';
type Turn={question:string;image:string|null;imageName:string;lessonId:string};
/** Isolated synthetic UI: deliberately imports no API client or live AI component. */
export function DemoAi({snapshot,handoff}:{snapshot:CampusSnapshot;handoff?:{lessonId:string;context:string}|null}){
 const [lessonId,setLessonId]=useState(handoff?.lessonId||snapshot.lessons[0]?.id||''),[question,setQuestion]=useState(handoff?.context||''),[attachment,setAttachment]=useState<{url:string;name:string}|null>(null),[turns,setTurns]=useState<Turn[]>([]),[error,setError]=useState('');
 useCampusDraftGuard(!!(question.trim()||attachment),false,'campus-ai');
 const urls=useRef<string[]>([]),file=useRef<HTMLInputElement>(null);
 useEffect(()=>()=>{for(const url of urls.current)URL.revokeObjectURL(url);},[]);
 function image(f:File|undefined){if(!f)return;if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>5*1024*1024){setError('PNG·JPG·WebP 캡처를 5MB 이하로 넣어 주세요.');return;}const url=URL.createObjectURL(f);urls.current.push(url);setAttachment({url,name:f.name||'붙여넣은 캡처'});setError('');}
 function drop(e:DragEvent){e.preventDefault();image(e.dataTransfer.files[0]);}
 function paste(e:ClipboardEvent){const f=Array.from(e.clipboardData.items).find(i=>i.kind==='file'&&i.type.startsWith('image/'))?.getAsFile();if(f){e.preventDefault();image(f);}}
 function send(e:FormEvent){e.preventDefault();if(!question.trim())return;setTurns(old=>[...old,{question:question.trim(),image:attachment?.url||null,imageName:attachment?.name||'',lessonId}]);setQuestion('');setAttachment(null);}
 return <section className={s.root}><div className={s.heading}><h2>AI 조교 화면 체험</h2><p>이 화면은 가상 예시이며 실제 AI에게 질문하거나 기록을 저장하지 않습니다. 실제 AI 답변 품질을 검증하는 화면은 아닙니다.</p></div><div className={s.card}><label className={s.form}>질문할 수업<select value={lessonId} onChange={e=>setLessonId(e.target.value)}>{snapshot.lessons.map(l=><option key={l.id} value={l.id}>{l.day}일차 · {l.title}</option>)}</select></label><div className={s.list} style={{marginTop:20}}>{turns.filter(t=>t.lessonId===lessonId).map((t,i)=><article key={i} className={s.item}><small>내 질문 · 가상 대화</small><p>{t.question}</p>{t.image&&<><p>{t.imageName}</p>{/* Object URLs are local-only synthetic attachments. */}<img src={t.image} alt="이 질문에 첨부한 가상 검수 캡처" style={{maxWidth:'100%',maxHeight:220,objectFit:'contain'}}/></>}<div className={s.reply}><small>고정된 예시 응답 · AI 생성 아님</small><p>목표와 시도한 방법을 구분해 적고, 가장 작은 결과물 하나부터 확인해 보세요. 실제 연결 화면에서는 선택한 수업과 공개 커리큘럼의 근거를 찾아 답변합니다.</p></div></article>)}</div><form className={s.form} onSubmit={send} onDrop={drop} onDragOver={e=>e.preventDefault()} onPaste={paste} style={{marginTop:24}}><label htmlFor="campus-demo-ai-question">질문</label><textarea id="campus-demo-ai-question" required maxLength={2000} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="예: 고객의 문제를 하나로 좁히려면 무엇부터 확인할까요?"/><p className={s.muted}>캡처를 여기에 끌어다 놓거나 붙여넣으세요.</p><input ref={file} type="file" accept="image/png,image/jpeg,image/webp" aria-label="가상 캡처 첨부" onChange={e=>image(e.target.files?.[0])}/>{attachment&&<div className={s.inline}><span>{attachment.name}</span><button type="button" onClick={()=>setAttachment(null)}>첨부 제거</button></div>}{error&&<p role="alert">{error}</p>}<button className={s.primary}>가상 질문 흐름 보기</button></form></div></section>;
}
