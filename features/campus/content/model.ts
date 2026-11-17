import {rooms,type TourRoom,type TourRole} from '../tour/model';
import {tourTasks,type TourTask} from '../tour/tasks';
import {DEFAULT_WELCOME,validateWelcome,welcomeImage,articleBody,type WelcomeArticle} from '../welcome/content';
export type RoomContent={title:string;description:string;image:string;imageAlt:string;body:string;articles:WelcomeArticle[];tasks:{id:string;title:string;description:string;visible:boolean}[]};
export type CampusContent=Partial<Record<TourRoom,RoomContent>>;
export function defaultRoom(id:TourRoom):RoomContent{const room=rooms.find(r=>r.id===id)!;return{title:room.name,description:room.description,image:'',imageAlt:'',body:'',articles:[],tasks:[]};}
export function validateCampusContent(value:unknown):CampusContent{
 const fail=():never=>{throw Object.assign(Error('공간 제목·소개·콘텐츠 설정을 확인해 주세요.'),{status:400});};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(id=>!rooms.some(r=>r.id===id)))return fail();
 const clean:CampusContent={};const text=(s:unknown,max:number,required=false)=>{if(typeof s!=='string'||s.length>max||required&&!s.trim())return fail();return s.trim();};
 for(const [id,raw]of Object.entries(value)){
  const v=raw as RoomContent;if(!v||typeof v!=='object'||Object.keys(v).some(k=>!['title','description','image','imageAlt','body','articles','tasks'].includes(k))||!Array.isArray(v.tasks)||v.tasks.length>60)return fail();
  const seen=new Set<string>();const tasks=v.tasks.map(t=>{if(!t||Object.keys(t).some(k=>!['id','title','description','visible'].includes(k))||!tourTasks.some(task=>task.room===id&&task.id===t.id)||seen.has(t.id)||typeof t.visible!=='boolean')return fail();seen.add(t.id);return{id:t.id,title:text(t.title,80,true),description:text(t.description,240),visible:t.visible};});
  clean[id as TourRoom]={title:text(v.title,80,true),description:text(v.description,600),image:v.image?welcomeImage(v.image):'',imageAlt:text(v.imageAlt,200),body:v.body?articleBody(v.body):'',articles:validateWelcome({...DEFAULT_WELCOME,notices:v.articles,lessons:[]}).notices,tasks};
 }
 if(new TextEncoder().encode(JSON.stringify(clean)).length>260000)throw Object.assign(Error('공간 콘텐츠가 너무 큽니다. 긴 본문을 나누거나 줄여 주세요.'),{status:400});
 return clean;
}
/** Card/intro copy is public. Only authorized rooms expose inner articles and tasks. */
export function visibleCampusContent(content:CampusContent={},role:TourRole='guest'):CampusContent{
 return Object.fromEntries(Object.entries(content).map(([id,c])=>{const allowed=role==='admin'||role==='student'||['live','library'].includes(id)||role==='waiting'&&id==='welcome';return[id,{...c,articles:allowed?c.articles.filter(a=>a.published):[],tasks:allowed?c.tasks:[]}];}));
}
export function contentTasks(content:CampusContent,room:TourRoom,role:TourRole):TourTask[]{
 const c=content[room];return [...(c?.body?[{id:'intro:'+room,room,group:'공간 안내',title:c.title+' 안내',description:c.description}]:[]),...tourTasks.filter(t=>t.room===room&&(!t.admin||role==='admin')).flatMap(t=>{const setting=c?.tasks.find(s=>s.id===t.id);return setting?.visible===false?[]:[{...t,...(setting?{title:setting.title,description:setting.description}:{})}];}),...(c?.articles||[]).filter(a=>a.published).map(a=>({id:'content:'+room+':'+a.id,room,group:'이 공간의 소식',title:a.title,description:'공지·자료 자세히 보기'}))];
}
