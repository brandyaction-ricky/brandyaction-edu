'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {SavedAiConversation} from '@/lib/curriculum-ai-history';
import {aiHistoryUrl} from '@/lib/curriculum-ai-history';
import {questionRequest} from './question-composer';
import {CurriculumAiConversation} from './curriculum-ai-conversation';
import {date} from '@/lib/platform';

export function MyAiConversations(){
 const [items,setItems]=useState<SavedAiConversation[]>([]),[selected,setSelected]=useState<SavedAiConversation|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[more,setMore]=useState(false),[version,setVersion]=useState(0);
 const draft=useRef({dirty:false,locked:false});const update=useCallback((v:{dirty:boolean;locked:boolean})=>{draft.current=v;},[]);
 const [cursor,setCursor]=useState<{time:string;id:string}>();
 useEffect(()=>{let alive=true;const abort=new AbortController();void questionRequest<{conversations:SavedAiConversation[];hasMore:boolean}>(aiHistoryUrl(undefined,undefined,cursor),undefined,abort.signal).then(data=>{if(!alive)return;setError('');setItems(old=>cursor?[...old,...data.conversations.filter(c=>!old.some(o=>o.id===c.id))]:data.conversations);setMore(data.hasMore);}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;abort.abort();};},[cursor,version]);
 function close(){if(draft.current.locked)return;if(draft.current.dirty&&!window.confirm('작성 중인 질문과 첨부를 닫을까요? 저장된 대화는 그대로 남습니다.'))return;setSelected(null);setLoading(true);setError('');draft.current={dirty:false,locked:false};setCursor(undefined);setVersion(v=>v+1);}
 return <section className="my-ai-conversations" aria-label="내 AI 질문 내역"><header className="my-ai-heading"><h3>내 AI 질문</h3><p>수업별로 모아둔 질문·답변·첨부입니다. 나만 볼 수 있어요.</p></header>
 {selected?<><button className="btn small mb16" type="button" onClick={close}>AI 질문 목록으로</button><CurriculumAiConversation key={selected.id} context={{enrollmentId:selected.enrollmentId,lessonId:selected.lessonId,label:selected.label,recent:true}} onStateChange={update} onCreated={()=>{draft.current={dirty:false,locked:false};close();}}/></>:<>
 <div className="my-ai-list">{items.map(c=><article className="my-ai-card" key={c.id}><div className="my-ai-card-meta"><span>저장된 AI 대화</span><time>{date(c.updatedAt)}</time></div><h4>{c.label}</h4><p className="my-ai-last-question">{c.lastQuestion}</p><button className="btn" type="button" onClick={()=>setSelected(c)}>대화 열고 이어서 질문 <span aria-hidden="true">→</span></button></article>)}</div>
 {loading&&<p role="status">AI 질문 내역을 불러오고 있어요.</p>}{error&&<p role="alert">{error} <button type="button" className="btn small" onClick={()=>{setLoading(true);setError('');setVersion(v=>v+1);}}>AI 내역 다시 불러오기</button></p>}
 {!loading&&!error&&!items.length&&<p className="meta">아직 AI에게 질문한 내역이 없어요. 수업에서 질문하면 여기에 자동으로 남아요.</p>}
 {more&&items.length>0&&<button type="button" className="btn" disabled={loading} onClick={()=>{const c=items.at(-1)!;setLoading(true);setError('');setCursor({time:c.updatedAt,id:c.id});}}>AI 질문 더 보기</button>}
 </>}
 </section>;
}
