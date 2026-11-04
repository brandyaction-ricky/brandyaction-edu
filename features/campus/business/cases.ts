import type {createClient} from '@/lib/supabase/server';
import {businessKinds,fail,safeUrl,validId,validateTitle,type BusinessKind,type Field,type Payload} from './domain';
type Database=Awaited<ReturnType<typeof createClient>>;
export const caseIndustries=['온라인 상품','전문 서비스','교육·콘텐츠'] as const;
export type CaseIndustry=typeof caseIndustries[number];
export const casePurposes={cohort_learning:'기수 안 학습 사례로 활용',website:'EDU 사이트의 사례 소개',sales_material:'교육 소개·세일즈 자료'};
export type CasePurpose=keyof typeof casePurposes;
export type CaseEvidence={recordId:string;revision:number;kind:BusinessKind;title:string;fields:string[];payload:Payload};
export type BusinessCase={id:string;user_id:string;enrollment_id:string;title:string;industry:CaseIndustry|null;summary:string;limits:string;evidence:CaseEvidence[];granted_purposes:CasePurpose[];allowed_purposes:CasePurpose[];status:'submitted'|'approved'|'changes_requested'|'rejected'|'withdrawn';revision:number;reviewed_revision:number|null;reviewer_note:string;reviewed_at:string|null;created_at:string;updated_at:string;consent_version:string};
export const caseColumns='id,user_id,enrollment_id,title,industry,summary,limits,evidence,granted_purposes,allowed_purposes,status,revision,reviewed_revision,reviewer_note,reviewed_at,created_at,updated_at,consent_version';
export type CaseSelection={recordId:string;revision:number;fields:string[]};
export const caseConsentVersion='moonshot-case-selection-v2';
export function validateCaseCommand(raw:unknown,admin=false){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail();const b=raw as Record<string,unknown>;
 if(!validId(b.id)||!validId(b.requestId)||!['submit','withdraw','review'].includes(String(b.action)))fail();
 const command:Record<string,unknown>={action:b.action,id:b.id,requestId:b.requestId};
 if(b.action==='submit'){
  if(admin||!validId(b.enrollmentId)||b.consent!==true||b.consentVersion!==caseConsentVersion)fail();
  if(b.industry!==undefined&&b.industry!==null&&!caseIndustries.includes(b.industry as CaseIndustry))fail();command.industry=b.industry??null;
  command.enrollmentId=b.enrollmentId;command.title=validateTitle(b.title);command.consentVersion=caseConsentVersion;command.consent=true;
  for(const key of ['summary','limits']){if(typeof b[key]!=='string'||!b[key].trim()||b[key].length>2000)fail();command[key]=b[key].trim();}
  if(!Array.isArray(b.purposes)||!b.purposes.length||b.purposes.length>3||new Set(b.purposes).size!==b.purposes.length||b.purposes.some(p=>!Object.hasOwn(casePurposes,String(p))))fail();command.purposes=b.purposes;
  if(!Array.isArray(b.selections)||!b.selections.length||b.selections.length>5)fail();
  command.selections=b.selections.map(v=>{if(!v||typeof v!=='object'||Array.isArray(v))fail();const s=v as CaseSelection;if(!validId(s.recordId)||!Number.isInteger(s.revision)||s.revision<1||!Array.isArray(s.fields)||!s.fields.length||s.fields.length>10||new Set(s.fields).size!==s.fields.length||s.fields.some(f=>typeof f!=='string'||f.length>40))fail();return {recordId:s.recordId,revision:s.revision,fields:s.fields};});
  if(new Set((command.selections as CaseSelection[]).map(s=>s.recordId)).size!==(command.selections as CaseSelection[]).length)fail();
 }else{
  if(!Number.isInteger(b.expectedRevision)||Number(b.expectedRevision)<1)fail();command.expectedRevision=b.expectedRevision;
  if(b.action==='withdraw'){if(admin||!Object.hasOwn(casePurposes,String(b.purpose)))fail();command.purpose=b.purpose;}
  else{if(!admin||!validId(b.cohortId)||!['approved','changes_requested','rejected'].includes(String(b.decision))||typeof b.note!=='string'||!b.note.trim()||b.note.length>2000)fail();command.cohortId=b.cohortId;command.decision=b.decision;command.note=b.note.trim();}
 }
 return command;
}
export function selectableCaseFields(kind:BusinessKind){return (businessKinds[kind].fields as Field[]).filter(f=>f.type!=='check');}
export function caseEvidencePreview(records:{id:string;revision:number;kind:BusinessKind;title:string;payload:Payload}[],selections:CaseSelection[]):CaseEvidence[]{return selections.flatMap(s=>{const r=records.find(v=>v.id===s.recordId&&v.revision===s.revision);if(!r)return [];const allowed=selectableCaseFields(r.kind).map(f=>f.key),fields=s.fields.filter(k=>allowed.includes(k));return [{recordId:r.id,revision:r.revision,kind:r.kind,title:r.title,fields,payload:Object.fromEntries(fields.map(k=>[k,r.payload[k]]))}];});}
export function evidenceValue(value:string|number|boolean){return String(value);}
export const evidenceIsLink=(v:unknown):v is string=>typeof v==='string'&&safeUrl(v);
export async function loadCases(db:Database,actor:string,enrollmentId:string,cursor:string|null=null){if(!validId(enrollmentId)||(cursor&&!validId(cursor)))fail();let q=db.from('edu_campus_business_cases').select(caseColumns).eq('user_id',actor).eq('enrollment_id',enrollmentId).order('id').limit(101);if(cursor)q=q.gt('id',cursor);const r=await q;if(r.error||!Array.isArray(r.data))fail(503);return {cases:r.data.slice(0,100),nextCursor:r.data.length>100?r.data[99].id:null};}
export async function loadAdminCases(db:Database,cohortId:string,cursor:string|null=null){if(!validId(cohortId)||(cursor&&!validId(cursor)))fail();let q=db.from('edu_campus_business_cases').select(`${caseColumns},enrollments!inner(cohort_id)`).eq('enrollments.cohort_id',cohortId).order('id').limit(201);if(cursor)q=q.gt('id',cursor);const r=await q;if(r.error||!Array.isArray(r.data))fail(503);return {cases:r.data.slice(0,200).map(c=>Object.fromEntries(Object.entries(c).filter(([k])=>k!=='enrollments'))),nextCursor:r.data.length>200?r.data[199].id:null};}
export async function mutateCase(db:Database,actor:string,raw:unknown,admin=false){const command=validateCaseCommand(raw,admin),r=await db.rpc('edu_campus_business_case_command',{p_actor:actor,p_command:command});if(r.error){const statuses:Record<string,number>={'42501':403,'23514':400,'23505':409,'P0002':404,'40001':409};fail(statuses[r.error.code]||503);}return r.data;}
