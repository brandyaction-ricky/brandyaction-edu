'use client';
import { useCallback,useEffect,useRef,useState,type FormEvent } from 'react';
import { ArrowDownToLine,ArrowUpRight,BriefcaseBusiness,Check,ChevronRight,FlaskConical,LockKeyhole,RefreshCw,Search,TrendingUp } from 'lucide-react';
import type { CampusSnapshot } from '../contracts';
import { applyBrief,businessDisplayValue,businessKinds,comparison,emptyPayload,exportBusiness,findResources,fingerprint,recipeTemplates,rehearsalQuestions,resourcePaths,validatePayload,validateTitle,type BusinessKind,type BusinessRecord,type BusinessState,type Field,type Payload } from './domain';
import type { BusinessCommand } from './repository';
import styles from './panel.module.css';
import { CustomerReviewPanel } from './review-panel';
import type {BusinessConnections} from './enhancements';
import {BriefHandoff,CampaignDiagram,IndustryRoute,IntegratedOutcomes,PracticeRecovery,RehearsalDialogue} from './enhancement-panels';
import {BusinessCasesPanel} from './case-panel';
import {BusinessTimelinePanel} from './timeline-panel';
import {useCampusDraftGuard,campusDraftState} from '../ui/draft-guard';

const groups:{label:string;kinds:BusinessKind[]}[]=[{label:'사업 설계',kinds:['brief','routine','decision']},{label:'실행 도구',kinds:['recipe','campaign','checklist','practice','rehearsal']},{label:'실험과 성과',kinds:['experiment','metric','review','case']}];
export type BusinessView=BusinessKind|'outcomes'|'timeline'|'routes'|'customers'|'resources';
type Props={snapshot:CampusSnapshot;demo:boolean;view?:BusinessView}&BusinessConnections;
export function BusinessPanel(props:Props){return <BusinessWorkspace key={`${props.snapshot.viewer.id}:${props.snapshot.selectedEnrollmentId}:${props.demo}`} {...props}/>;}
function BusinessWorkspace({snapshot,demo,onAsk,onOpenLesson,view}:Props){
  const enrollmentId=snapshot.selectedEnrollmentId;
  const [records,setRecords]=useState<BusinessRecord[]>([]),[kind,setKind]=useState<BusinessKind>(view&&view in businessKinds?view as BusinessKind:'brief'),[draft,setDraft]=useState<Payload>(emptyPayload(view&&view in businessKinds?view as BusinessKind:'brief')),[title,setTitle]=useState(''),[editing,setEditing]=useState<BusinessRecord|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(!demo),[error,setError]=useState(''),[message,setMessage]=useState(''),[cursor,setCursor]=useState<string|null>(null),[query,setQuery]=useState(''),[path,setPath]=useState<keyof typeof resourcePaths>('온라인 상품');
  const originalDraft={...emptyPayload(kind),...editing?.payload};
  const draftChanged=title!==(editing?.title||'')||Object.keys(originalDraft).some(key=>draft[key]!==originalDraft[key]);
  useCampusDraftGuard(draftChanged,busy,'campus-business');
  const live=useRef(true), pending=useRef<{signature:string;command:BusinessCommand}|null>(null);
  const storageKey=`moonshot-business-demo-v1:${snapshot.viewer.id}:${enrollmentId}`;
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const load=useCallback(async(more=false)=>{
    if(!enrollmentId)return;setLoading(true);setError('');
    try{
      if(demo){const raw=localStorage.getItem(storageKey);if(raw){const values=JSON.parse(raw) as BusinessRecord[];if(!Array.isArray(values)||values.some(r=>r.enrollment_id!==enrollmentId||r.user_id!==snapshot.viewer.id))throw new Error('예시 기록을 읽을 수 없습니다.');values.forEach(r=>validatePayload(r.kind,r.payload));setRecords(values);}setCursor(null);return;}
      const url=new URL('/api/campus/business',window.location.origin);url.searchParams.set('enrollmentId',enrollmentId);if(more&&cursor)url.searchParams.set('cursor',cursor);
      const response=await fetch(url,{cache:'no-store'});const data=await response.json();if(!response.ok){if(live.current&&[401,403].includes(response.status)){setRecords([]);setEditing(null);setDraft(emptyPayload(kind));setTitle('');}throw new Error(data.error||'기록을 불러오지 못했습니다.');}if(!live.current)return;
      const state=data as BusinessState;setRecords(previous=>more?[...previous,...state.records.filter(r=>!previous.some(p=>p.id===r.id))]:state.records);setCursor(state.nextCursor);
    }catch(e){if(live.current)setError(e instanceof Error?e.message:'기록을 불러오지 못했습니다.');}finally{if(live.current)setLoading(false);}
  },[cursor,demo,enrollmentId,snapshot.viewer.id,storageKey,kind]);
  // The keyed workspace isolates enrollments; hydrate browser storage/fetch after mount.
  useEffect(()=>{let cancelled=false;void Promise.resolve().then(()=>{if(!cancelled)void load();});return()=>{cancelled=true;};},[]); // eslint-disable-line react-hooks/exhaustive-deps
  const canReplace=()=>{const guard=campusDraftState('campus-business');if(guard.locked){setMessage('저장을 마친 후 다른 기록을 열어 주세요.');return false;}return !guard.dirty||window.confirm('저장하지 않은 사업 기록이 있습니다. 내용을 버리고 다른 기록을 열까요?');};
  const select=(next:BusinessKind,force=false)=>{if(!force&&!canReplace())return;setKind(next);setDraft(emptyPayload(next));setTitle('');setEditing(null);setError('');setMessage('');pending.current=null;};
  const edit=(r:BusinessRecord)=>{if(!canReplace())return;setKind(r.kind);setDraft({...emptyPayload(r.kind),...r.payload});setTitle(r.title);setEditing(r);setError('');setMessage('');pending.current=null;};
  const save=async(event?:FormEvent,archive?:BusinessRecord)=>{
    event?.preventDefault();if(!enrollmentId||busy)return;setError('');setMessage('');
    try{
      const payload=archive?archive.payload:validatePayload(kind,draft),cleanTitle=archive?archive.title:validateTitle(title);
      const active=archive||editing,action=archive?'archive':editing?'update':'create';
      const signature=JSON.stringify({action,id:active?.id,enrollmentId,revision:active?.revision,kind,title:cleanTitle,payload});
      const command=pending.current?.signature===signature?pending.current.command:{action,id:active?.id||crypto.randomUUID(),requestId:crypto.randomUUID(),enrollmentId,expectedRevision:active?.revision,kind:archive?.kind||kind,title:cleanTitle,payload} as BusinessCommand;
      pending.current={signature,command};setBusy(true);
      let saved:BusinessRecord;
      if(demo){const now=new Date().toISOString();saved={id:command.id,user_id:snapshot.viewer.id,enrollment_id:enrollmentId,kind:command.kind!,title:cleanTitle,payload,revision:(active?.revision||0)+1,created_at:active?.created_at||now,updated_at:now,archived_at:archive?now:null,last_command_id:command.requestId,creation_fingerprint:active?.creation_fingerprint||fingerprint(command.kind!,cleanTitle,payload)};const next=[saved,...records.filter(r=>r.id!==saved.id)].filter(r=>!r.archived_at);localStorage.setItem(storageKey,JSON.stringify(next));}
      else{const response=await fetch('/api/campus/business',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});const data=await response.json();if(!response.ok)throw new Error(data.error||'저장하지 못했습니다.');saved=data.record;}
      if(!live.current)return;setRecords(previous=>[saved,...previous.filter(r=>r.id!==saved.id)].filter(r=>!r.archived_at));pending.current=null;
      window.dispatchEvent(new CustomEvent('campus:business-records-changed',{detail:{enrollmentId,demo}}));
      if(archive){if(editing?.id===archive.id)select(kind,true);setMessage('기록을 보관했습니다.');}else{setEditing(saved);setDraft(saved.payload);setTitle(saved.title);setMessage(demo?'예시 기록을 이 브라우저에 저장했어요.':'내 비공개 기록에 저장했어요.');}
    }catch(e){setError(e instanceof Error&&e.name!=='BusinessError'?e.message:'필수 항목·날짜·숫자·링크을 확인해 주세요.');}finally{if(live.current)setBusy(false);}
  };
  const exportRecords=()=>{const blob=new Blob([exportBusiness(records)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`moonshot-business-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);};
  const brief=records.filter(r=>r.kind==='brief').toSorted((a,b)=>b.updated_at.localeCompare(a.updated_at))[0]?.payload;
  const matched=findResources(snapshot,query||resourcePaths[path].join(' '));
  const compare=comparison(records),current=businessKinds[kind],kindRecords=records.filter(r=>r.kind===kind).toSorted((a,b)=>b.updated_at.localeCompare(a.updated_at));
  if(!enrollmentId)return <section className={styles.panel}><h2>문샷 실행 스튜디오</h2><p>이용할 수강권을 선택해 주세요.</p></section>;
  return <section className={styles.panel} aria-label="문샷 실행 스튜디오">
    <header className={styles.header}><div><span className={styles.eyebrow}>문샷 · 내 사업 실행</span><h2>배운 것을, 내 사업의 실행으로.</h2><p>계획부터 실험과 회고까지 한곳에 남기세요.</p></div><div className={styles.headerActions}><span className={styles.private}><LockKeyhole size={14}/> 나만 보는 기록</span>{records.length>0&&<button type="button" onClick={exportRecords} disabled={loading||!!cursor}><ArrowDownToLine size={16}/> 내 기록 내려받기</button>}</div></header>
    {demo&&<p className={styles.notice}>화면 검수 모드 · 이 브라우저의 예시 기록만 사용합니다. 서버 저장·AI 호출·외부 공개는 없습니다.</p>}
    {cursor&&<p className={styles.notice}>최근 기록 일부를 불러왔어요. 전체 기록을 불러온 뒤 비교·내려받기가 정확해집니다. <button type="button" disabled={loading} onClick={()=>void load(true)}>기록 더 불러오기</button></p>}
    <div hidden={!!view} className={styles.stats}><article><BriefcaseBusiness size={18}/><span>다시 쓸 수 있는 기록</span><strong>{records.filter(r=>['recipe','campaign','decision','practice'].includes(r.kind)).length}<small>개</small></strong><p>다시 꺼내 쓸 내 기록</p></article><article><FlaskConical size={18}/><span>진행 중인 실험</span><strong>{records.filter(r=>r.kind==='experiment'&&r.payload.status==='진행 중').length}<small>개</small></strong><p>예상과 실제 결과를 함께 기록</p></article><article><TrendingUp size={18}/><span>성과 기록</span><strong>{records.filter(r=>r.kind==='metric').length}<small>회</small></strong><p>본인 입력 · 검증되지 않은 수치</p></article></div>
    <div hidden={!!view&&!(view in businessKinds)} className={styles.layout} style={view?{display:view in businessKinds?'block':'none'}:undefined}><nav hidden={!!view} className={styles.nav} aria-label="사업 실행 도구">{groups.map(group=><div key={group.label}><h3>{group.label}</h3>{group.kinds.map(value=><button key={value} type="button" className={kind===value?styles.selected:''} aria-pressed={kind===value} onClick={()=>select(value)}>{businessKinds[value].title}<ChevronRight size={14}/></button>)}</div>)}</nav>
      <div className={styles.content}><div className={styles.formHeader}><div><h3>{current.title}</h3><p>{current.description}</p></div><button type="button" onClick={()=>void load()} disabled={loading||busy} aria-label="사업 기록 새로고침"><RefreshCw size={16}/></button></div>
        {kind==='recipe'&&<div className={styles.templates}><span>시작 템플릿</span>{recipeTemplates.map(t=><button type="button" key={t.name} onClick={()=>{if(!canReplace())return;setTitle(t.name);setDraft({...emptyPayload('recipe'),goal:t.name,prompt:applyBrief(t.prompt,brief),steps:t.steps});setEditing(null);pending.current=null;}}>{t.name}</button>)}</div>}
        {kind==='rehearsal'&&<aside className={styles.guide}><strong>인터뷰 준비용 질문 · 규칙 기반</strong><p>아래 질문은 실제 고객의 반응을 예측하거나 대신 답하지 않습니다.</p>{rehearsalQuestions(brief).map(q=><button type="button" key={q} onClick={()=>setDraft(previous=>({...previous,question:q,audience:String(brief?.customer||previous.audience)}))}>{q}<ChevronRight size={14}/></button>)}</aside>}
        {kind==='metric'&&<div className={styles.comparison}><h4>시작점 → 최근 성과 기록</h4><p>{cursor?'전체 기록을 불러온 뒤 비교합니다.':compare.reason}</p>{compare.deltas&&!cursor&&<div className={styles.deltaGrid}>{[['actions','마케팅 실행','회'],['leads','문의','건'],['revenue','매출',String(compare.latest!.payload.currency)],['minutes','쓴 시간','분']].map(([key,label,unit])=><article key={key}><span>{label}</span><strong>{compare.deltas![key]>0?'+':''}{compare.deltas![key].toLocaleString()} <small>{unit}</small></strong><p>{Number(compare.base!.payload[key]).toLocaleString()} → {Number(compare.latest!.payload[key]).toLocaleString()}</p></article>)}</div>}</div>}
        {loading&&<p role="status">기록을 불러오는 중입니다.</p>}
        {error&&<p role="alert" className={styles.error}>{error}</p>}{message&&<p role="status" className={styles.success}><Check size={16}/>{message}</p>}
        <form onSubmit={event=>void save(event)} className={styles.form} aria-label={`${current.title} 작성`}>
          <label className={styles.full}>기록 제목 <span>*</span><input value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} required placeholder={`${current.title}에 이름을 붙여 주세요`}/></label>
          {(current.fields as Field[]).filter(field=>kind!=='rehearsal'||!['answer','insight'].includes(field.key)).map(field=><label key={field.key} className={field.type==='long'?styles.full:field.type==='check'?styles.check:''}>
            {field.type==='check'?<><input type="checkbox" checked={Boolean(draft[field.key])} onChange={e=>setDraft(previous=>({...previous,[field.key]:e.target.checked}))}/><span>{field.label}</span></>:<>{field.label}{field.required&&<span> *</span>}{field.type==='long'?<textarea value={String(draft[field.key]??'')} maxLength={4000} required={field.required} rows={3} onChange={e=>setDraft(previous=>({...previous,[field.key]:e.target.value}))}/>:field.type==='select'?<select value={String(draft[field.key]??'')} onChange={e=>setDraft(previous=>({...previous,[field.key]:e.target.value}))}>{field.choices?.map(choice=><option key={choice} value={choice}>{businessDisplayValue(kind,field.key,choice)}</option>)}</select>:<input type={field.type==='url'?'url':field.type==='date'?'date':field.type==='number'?'number':'text'} value={draft[field.key]===undefined?'':String(draft[field.key])} min={field.type==='number'?0:undefined} max={field.max} step={field.key==='price'||field.key==='revenue'?'0.01':field.type==='number'?1:undefined} maxLength={500} required={field.required} onChange={e=>setDraft(previous=>({...previous,[field.key]:field.type==='number'?(e.target.value===''?'':Number(e.target.value)):e.target.value}))}/>}</>}
          </label>)}
          {kind==='rehearsal'&&<div className={styles.full}><RehearsalDialogue payload={draft} onChange={setDraft}/></div>}
          {kind==='campaign'&&<div className={styles.full}><CampaignDiagram payload={draft}/></div>}
          {kind==='checklist'&&<p className={styles.full}>직접 체크한 항목 {['offer','links','mobile','claims','privacy'].filter(k=>draft[k]===true).length}/5 · 모두 체크해도 외부 페이지나 법률 검수가 완료된 것은 아닙니다.</p>}
          <div className={styles.formFooter}><span>{editing?'저장된 기록 수정 중':'새 비공개 기록'}{kind==='metric'?' · 참고 링크이 있어도 검증된 수치로 표시하지 않습니다.':''}</span><button type="submit" className={styles.primary} disabled={busy||loading}>{busy?'저장 중…':editing?'변경 저장':'내 기록에 저장'}</button></div>
        </form>
        {kind==='brief'&&<BriefHandoff snapshot={snapshot} payload={draft} onAsk={onAsk} onOpenLesson={onOpenLesson}/>}
        {kind==='practice'&&<PracticeRecovery snapshot={snapshot} payload={draft} onAsk={onAsk} onOpenLesson={onOpenLesson}/>}
        {kind==='case'&&<BusinessCasesPanel records={records} enrollmentId={enrollmentId} viewerId={snapshot.viewer.id} demo={demo}/>}
        <section className={styles.saved}><div><h4>저장한 {current.title}</h4><button type="button" onClick={()=>select(kind)}>새 기록</button></div>{!kindRecords.length?<p>첫 기록을 남기면 여기에서 다시 열 수 있어요.</p>:kindRecords.map(r=><article key={r.id}><div><strong>{r.title}</strong><p>{new Date(r.updated_at).toLocaleDateString('ko-KR')} · {r.kind==='metric'?'본인 입력':r.kind==='checklist'?'직접 점검':'비공개'}</p></div><button type="button" onClick={()=>edit(r)}>열기</button><button type="button" disabled={busy} onClick={()=>void save(undefined,r)}>보관</button></article>)}</section>
      </div>
    </div>
    {(!view||view==='outcomes')&&<IntegratedOutcomes snapshot={snapshot} records={records} partial={!!cursor}/>}
    {(!view||view==='timeline')&&<BusinessTimelinePanel snapshot={snapshot} demo={demo} records={records}/>}
    {(!view||view==='routes')&&<IndustryRoute snapshot={snapshot} onOpenLesson={onOpenLesson} demo={demo}/>}
    {(!view||view==='customers')&&<CustomerReviewPanel enrollmentId={enrollmentId} demo={demo}/>}
    <section hidden={!!view&&view!=='resources'} className={styles.resources}><div><span className={styles.eyebrow}>필요한 수업 찾기</span><h3>지금 막힌 곳에서, 수업으로 돌아가기</h3><p>현재 수강권에 공개된 수업 제목에서 키워드를 찾습니다. AI 답변이나 맞춤 진단이 아닙니다.</p></div><div className={styles.search}><label>사업 유형별 참고 경로<select value={path} onChange={e=>{setPath(e.target.value as keyof typeof resourcePaths);setQuery('');}}>{Object.keys(resourcePaths).map(p=><option key={p}>{p}</option>)}</select></label><label>지금 필요한 키워드<div><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="예: 고객, 광고, 콘텐츠" maxLength={120}/></div></label></div><div className={styles.resourceList}>{matched.length?matched.map(lesson=><a key={lesson.id} href={lesson.href}><span>{lesson.day}일차</span><strong>{lesson.title}</strong><ArrowUpRight size={17}/></a>):<p>이 키워드와 일치하는 공개 수업이 없어요. 키워드를 바꾸거나 <a href={snapshot.links.classes}>전체 수업</a>을 확인해 주세요.</p>}</div></section>
  </section>;
}
