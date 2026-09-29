"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { date, text as t, type Row } from '@/lib/platform';
import { useUnsavedLearningChanges } from './use-unsaved-learning-changes';
import './lesson-questions.css';
import { QuestionImage, QuestionImagePicker, type QuestionImagePickerHandle } from './question-image';
import { QuestionAnswerHistory } from './question-thread';

export function LessonQuestions({ enrollmentId, lessonId, lessonTitle }: { enrollmentId: string; lessonId: string; lessonTitle: string }) {
  const [open, setOpen] = useState(false), [title, setTitle] = useState(''), [content, setContent] = useState('');
  const [questions, setQuestions] = useState<Row[]>([]), [page, setPage] = useState(0), [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [readError, setReadError] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [version,setVersion] = useState(0);
  const [image, setImage] = useState<{ id: string | null; busy: boolean; draft: boolean }>({ id: null, busy: false, draft: false });
  const [imageVersion, setImageVersion] = useState(0);
  const requestId = useRef(''), submitting = useRef(false);
  const imagePicker = useRef<QuestionImagePickerHandle>(null);
  useUnsavedLearningChanges(Boolean(title || content || image.draft));
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/platform/lesson-questions?enrollment=${encodeURIComponent(enrollmentId)}&lesson=${encodeURIComponent(lessonId)}&page=${page}`, { cache:'no-store', signal:controller.signal })
      .then(async response => { const result=await response.json(); if(!response.ok) throw new Error(result.error); return result; })
      .then(result => {setQuestions(result.questions || []);setHasMore(Boolean(result.hasMore));setReadError('');setLoading(false);})
      .catch(cause => {if(!controller.signal.aborted){setReadError(cause.message || '질문 목록을 불러오지 못했습니다.');setLoading(false);}});
    return () => controller.abort();
  },[enrollmentId,lessonId,page,version]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if(submitting.current || image.busy || (image.draft && !image.id) || !title.trim() || (!content.trim() && !image.id)) return;
    submitting.current=true; setBusy(true);setError('');setNotice('');
    if(!requestId.current) requestId.current=crypto.randomUUID();
    try {
      const response=await fetch('/api/platform/lesson-questions',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({enrollmentId,lessonId,requestId:requestId.current,title,content,...(image.id ? {imageId:image.id} : {})})});
      const result=await response.json();
      if(!response.ok){if(response.status < 500){setUncertain(false);requestId.current='';}else setUncertain(true);throw new Error(result.error);}
      setTitle('');setContent('');setImage({id:null,busy:false,draft:false});setImageVersion(v=>v+1);requestId.current='';setUncertain(false);setOpen(false);
      setNotice('질문을 등록했습니다. 이 수업에서 답변을 확인할 수 있습니다.');setPage(0);setLoading(true);setVersion(value=>value+1);
    }catch(cause){setError(cause instanceof Error ? cause.message : '연결을 확인하고 다시 시도해 주세요.');if(requestId.current)setUncertain(true);}
    finally{submitting.current=false;setBusy(false);}
  }
  return <section id="lesson-questions" className="lesson-private-questions" aria-label="이 학습의 개인 질문">
    <div className="lesson-question-heading"><div><h2>이 학습의 개인 질문</h2><p>질문과 답변은 본인과 담당 운영자만 확인합니다.</p></div><button type="button" className="btn" onClick={()=>setOpen(value=>!value)}>{open?'작성 접기':'이 학습에 질문하기'}</button></div>
    <form onSubmit={submit} className="lesson-question-form" style={open ? undefined : {display:"none"}} onPaste={event => {
      if (process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED !== 'true') return;
      const files = Array.from(event.clipboardData.items).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => file !== null);
      if (!files.length) return;
      event.preventDefault(); imagePicker.current?.paste(files);
    }}>
      <p className="meta">질문할 학습: {lessonTitle}</p>
      <label className="field">질문 제목<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} disabled={busy || uncertain}/></label>
      <label className="field">질문 내용<textarea required={!image.id} maxLength={10000} rows={5} value={content} onChange={e=>setContent(e.target.value)} disabled={busy || uncertain} placeholder="궁금한 부분을 적어주세요. 영상의 특정 부분이라면 시간을 함께 적어주시면 좋습니다."/></label>
      {process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED === 'true' && <QuestionImagePicker ref={imagePicker} key={imageVersion} enrollmentId={enrollmentId} lessonId={lessonId} locked={busy || uncertain} changed={(id, uploading, draft)=>setImage({id,busy:uploading,draft})}/>}
      {uncertain && <p className="meta">등록 결과를 확인하지 못했습니다. 같은 내용으로 다시 확인하면 중복 등록되지 않습니다.</p>}
      <button className="btn primary" disabled={busy || image.busy || (image.draft && !image.id) || !title.trim() || (!content.trim() && !image.id)}>{busy?'등록 중…':uncertain?'등록 결과 다시 확인':'질문 등록'}</button>
      {error && <p role="alert" className="form-error">{error}</p>}
    </form>
    {notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">내 질문을 불러오고 있습니다.</p> : readError ? <p role="alert">{readError} <button type="button" className="btn small" onClick={()=>{setLoading(true);setVersion(v=>v+1);}}>질문 다시 불러오기</button></p> : <>
      {questions.map(question=><article className="question-card" key={question.id}><div className="between"><b>{question.status==='answered'?'답변 완료':'답변 대기'}</b><span className="meta">{date(question.created_at)}</span></div><h3>{t(question,'title')}</h3><p className="reading-copy">{t(question,'content')}</p><QuestionImage questionId={String(question.id)} imageId={question.image_id}/>{process.env.NEXT_PUBLIC_EDU_QUESTION_THREADS_ENABLED === 'true' ? <QuestionAnswerHistory questionId={String(question.id)} fallback={String(question.answer || '')} onStatusChange={status => setQuestions(old => old.some(row => row.id === question.id && row.status !== status) ? old.map(row => row.id === question.id ? {...row, status} : row) : old)}/> : Boolean(question.answer) && <div className="answer"><b>운영자 답변</b><p className="reading-copy">{t(question,'answer')}</p></div>}</article>)}
      {!questions.length && <p className="meta">이 학습에 남긴 질문이 없습니다.</p>}
      {(page>0 || hasMore) && <div className="row"><button type="button" className="btn small" disabled={page===0} onClick={()=>{setLoading(true);setPage(p=>p-1);}}>이전 질문</button><span>{page+1}페이지</span><button type="button" className="btn small" disabled={!hasMore} onClick={()=>{setLoading(true);setPage(p=>p+1);}}>다음 질문</button></div>}
    </>}
    <div className="lesson-question-footer"><button type="button" className="btn small" disabled={loading || busy} onClick={()=>{setLoading(true);setVersion(v=>v+1);}}>답변 새로고침</button><Link className="link" href="/my/questions">내 질문 전체 보기</Link></div>
  </section>;
}
