'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { MessageCircle } from 'lucide-react';
import type { AiTurn } from '@/lib/curriculum-ai';
import styles from './preview-question.module.css';

export function PreviewQuestion({cohort,lesson,title}:{cohort:string;lesson:string;title:string}) {
  const [open,setOpen]=useState(false);
  const id=useId(), trigger=useRef<HTMLButtonElement>(null);
  return <>
    <button type="button" className="btn primary" ref={trigger} aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(v=>!v)}>
      <MessageCircle size={17} aria-hidden="true"/> AI에게 질문하기
    </button>
    {open&&<Chat id={id} cohort={cohort} lesson={lesson} title={title} close={()=>{setOpen(false);trigger.current?.focus();}}/>}
  </>;
}

function Chat({id,cohort,lesson,title,close}:{id:string;cohort:string;lesson:string;title:string;close:()=>void}) {
  const [turns,setTurns]=useState<AiTurn[]>([]),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const active=useRef<AbortController|null>(null),input=useRef<HTMLTextAreaElement>(null),latest=useRef<HTMLDivElement>(null);
  useEffect(()=>{input.current?.focus({preventScroll:true});return ()=>active.current?.abort();},[]);
  useEffect(()=>{if(turns.length)latest.current?.scrollIntoView({block:'nearest'});},[turns]);
  async function send(e:FormEvent) {
    e.preventDefault();
    const question=draft.trim();if(!question||active.current)return;
    const controller=new AbortController();active.current=controller;setBusy(true);setError('');
    try {
      const res=await fetch('/api/admin/campus/study/question',{method:'POST',headers:{'content-type':'application/json'},signal:controller.signal,
        body:JSON.stringify({cohort,lesson,question,history:turns.slice(-4).map(t=>({...t,text:t.text.slice(0,1500)}))})});
      const data=await res.json();if(!res.ok||typeof data.answer!=='string')throw Error(data.error||'답변을 받지 못했어요.');
      setTurns(prev=>[...prev,{role:'user',text:question},{role:'assistant',text:data.answer}]);setDraft('');
    } catch(e) {if(!controller.signal.aborted)setError(e instanceof Error?e.message:'연결을 확인하고 다시 보내 주세요.');}
    finally {active.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  return <section id={id} aria-label="관리자 AI 질문" className={styles.panel}>
    <header><div><small>관리자 미리보기</small><h3>{title}</h3></div><button className="btn small" type="button" onClick={close}>대화 닫기</button></header>
    <p>현재 수업을 바탕으로 답해요. 대화를 닫으면 내용이 사라지고, 수강생 질문 기록에는 남지 않아요.</p>
    <div aria-live="polite">{turns.map((t,i)=><div ref={i===turns.length-1?latest:undefined} className={styles.turn} key={i}><strong>{t.role==='user'?'내 질문':'AI 답변'}</strong><p>{t.text}</p></div>)}</div>
    <form onSubmit={send}><label htmlFor={id+'-input'}>{turns.length?'이어서 질문하기':'궁금한 점'}</label>
      <textarea id={id+'-input'} ref={input} rows={2} maxLength={1500} placeholder="어느 단계에서 막혔나요?" value={draft} onChange={e=>setDraft(e.target.value)} readOnly={busy}/>
      {error&&<p role="alert">{error}</p>}
      <button className="btn primary" type="submit" disabled={busy||!draft.trim()}>{busy?'답변 작성 중…':'AI 답변 받기'}</button>
    </form>
  </section>;
}
