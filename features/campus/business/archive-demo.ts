import {validateArchiveCommand,type ArchiveEntry} from './archive';
const scope='00000000-0000-4000-8000-000000000099';
const key='moonshot-tour-archive-v1';
/** Explicit demo only; never delegates to the API. */
export async function demoArchiveCall(collection:string,enrollmentId?:string,body?:unknown){
 const items:ArchiveEntry[]=JSON.parse(localStorage.getItem(key)||'[]');
 if(body){const c=validateArchiveCommand(body);if(c.enrollmentId!==scope||c.action==='copy')throw Error('이 예시에서는 본인이 작성한 새 기록만 저장합니다.');const before=items.find(i=>i.id===c.id);if(c.action==='update'&&(!before||before.revision!==c.expectedRevision))throw Error('다른 창에서 변경됐어요. 새로고침해 주세요.');const entry={...before,id:String(c.id),enrollment_id:scope,kind:c.kind,title:c.title,body:c.body,url:c.url,source_kind:null,source_id:null,source_revision:null,revision:(before?.revision||0)+1,created_at:before?.created_at||new Date().toISOString(),updated_at:new Date().toISOString()} as ArchiveEntry;localStorage.setItem(key,JSON.stringify([entry,...items.filter(i=>i.id!==entry.id)]));return{entry};}
 if(collection==='scopes')return{items:[{id:scope,courseTitle:'문샷 예시 과정',cohortName:'종료된 가상 기수',reason:'미리보기'}]};
 if(enrollmentId!==scope)throw Error('예시 보관함을 선택해 주세요.');return{items:collection==='entries'?items:[],nextCursor:null};
}
