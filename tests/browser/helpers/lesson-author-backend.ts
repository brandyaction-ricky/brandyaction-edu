import type {Page,Route} from '@playwright/test';
import type {AuthorHistoryItem} from '../../../lib/lesson-author-history';
import type {AuthorPayload,AuthorSnapshot} from '../../../lib/lesson-author-drafts';
export const id=(n:number)=>`aaaaaaab-1111-4111-8111-${String(n).padStart(12,'0')}`;
export const payload=():AuthorPayload=>({form:{basic:{week_id:id(5),day_number:'1',title:'공개된 수업',description:'',duration_label:'10분',is_published:true,is_preview:false},format:'text',bodyText:'원래 본문',videoUrl:'',externalUrl:'',resourceName:'',resourcePath:''},blocks:{active:true,document:{schemaVersion:1,blocks:[{id:'original',type:'text',content:'학생이 보는 원래 본문'}],checklist:[]}}});
const jsonb=(value:unknown)=>JSON.parse(JSON.stringify(value,(_key,item)=>item && !Array.isArray(item) && typeof item==='object' ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>b.localeCompare(a))) : item));
export async function backend(page:Page){
 let state:AuthorSnapshot & {public:{payload:AuthorPayload}}={lessonId:id(4),revision:null,publishedRevision:null,publishedStamp:null,baseStamp:'a'.repeat(32),payload:payload(),public:{stamp:'a'.repeat(32),payload:payload(),blockRevision:id(70)},history:[]};
 const versions=new Map<string,AuthorPayload>([[id(71),payload()]]), writes:Record<string,unknown>[]=[];let failSave=0,failPublish=0,hold:Promise<void>|null=null;
 const handler=async (route:Route)=>{
  if(route.request().method()==='GET'&&new URL(route.request().url()).searchParams.get('history')==='1'){
   const q=new URL(route.request().url()).searchParams;
   let rows=state.history.map(x=>({...x,createdBy:id(1),editor:'테스트 관리자',source:'legacy',note:'',...((x as unknown) as Partial<AuthorHistoryItem>)}));
   if(q.get('mode')!=='all')rows=rows.filter(r=>r.published||r.baseline||r.source==='manual'||r.source==='backup');
   if(q.get('beforeId'))rows=rows.slice(rows.findIndex(r=>r.revision===q.get('beforeId'))+1);
   if(q.get('editor'))rows=rows.filter(r=>r.editor.includes(q.get('editor')!));
   const shown=rows.slice(0,30);await route.fulfill({json:{rows:shown,next:rows.length>30?{at:shown.at(-1)!.createdAt,id:shown.at(-1)!.revision}:null}});return;
  }
  if(route.request().method()==='GET'){const q=new URL(route.request().url()).searchParams,v=q.get('version');await route.fulfill({json:jsonb(q.get('source')==='public'?state.public:v?{payload:versions.get(v),revision:v}:{...state,public:{stamp:state.public.stamp,blockRevision:state.public.blockRevision}})});return;}
  const body=route.request().postDataJSON();writes.push(body);
  if(body.action==='backup'){versions.set(body.requestId,structuredClone(body.payload));await route.fulfill({json:{revision:body.requestId,backup:true}});return;}
  if(body.action==='save'){
   if(versions.has(body.requestId)){await route.fulfill({json:{revision:body.requestId}});return;}
   if(failSave===409){failSave=0;await route.fulfill({status:409,json:{error:'다른 화면에서 초안을 저장했습니다.'}});return;}
   if(body.expectedRevision!==state.revision){await route.fulfill({status:409,json:{error:'저장 충돌'}});return;}
   if(!state.revision)state.history.push({revision:id(71),title:'공개된 수업',createdAt:'2026-10-01T05:00:00Z',baseline:true,published:false});
   state={...state,lessonId:body.lessonId,revision:body.requestId,payload:structuredClone(body.payload),baseStamp:state.public.stamp};versions.set(body.requestId,structuredClone(body.payload));state.history.unshift({revision:body.requestId,title:body.payload.form.basic.title,createdAt:'2026-10-01T06:00:00Z',baseline:false,published:false,...{source:body.saveSource??'manual',note:body.saveNote??'',editor:'테스트 관리자',createdBy:id(1)}});
   if(failSave){const status=failSave;failSave=0;await route.fulfill({status,json:{error:'저장 응답을 확인하지 못했습니다.'}});return;}
   const wait=hold;hold=null;if(wait)await wait;await route.fulfill({json:{revision:body.requestId}});return;
  }
  if(failPublish){const status=failPublish;failPublish=0;await route.fulfill({status,json:{error:'파일 연결을 확인해 주세요.'}});return;}
  state={...state,publishedRevision:state.revision,publishedStamp:'b'.repeat(32),public:{stamp:'b'.repeat(32),payload:structuredClone(state.payload),blockRevision:body.requestId}};state.history=state.history.map(x=>({...x,published:x.published||x.revision===state.revision}));await route.fulfill({json:{revision:body.revision,published:true}});
 };
 await page.route('**/api/admin/lesson-author**',handler);
 await page.route('**/api/admin/ongoing-lessons**',r=>r.fulfill({json:{setting:null}}));
 return{attach:async (other:Page)=>{await other.route('**/api/admin/lesson-author**',handler);await other.route('**/api/admin/ongoing-lessons**',r=>r.fulfill({json:{setting:null}}));},pauseNextSave:()=>{let resume!:()=>void;hold=new Promise<void>(resolve=>{resume=resolve;});return resume;},writes,get:()=>state,failSave:(n:number)=>failSave=n,failPublish:(n:number)=>failPublish=n};
}
