import type { CampusSnapshot } from '../contracts';

export type Field = { key: string; label: string; type?: 'text' | 'long' | 'url' | 'date' | 'number' | 'check' | 'select'; required?: boolean; max?: number; choices?: string[]; hint?: string; legacyDefault?: string | boolean };
const f = (key: string, label: string, type: Field['type'] = 'text', extra: Partial<Field> = {}): Field => ({ key, label, type, ...extra });
export const businessKinds = {
  brief: { title: '내 사업 계획', description: '상품·고객·가격·말투를 한 번 정리하고 실행 도구에 재사용하세요.', fields: [f('product','상품·서비스','text',{required:true}),f('customer','핵심 고객','text',{required:true}),f('problem','고객이 해결하고 싶은 문제','long',{required:true}),f('price','판매 가격','number',{required:true,max:1e12}),f('currency','금액 단위','select',{choices:['KRW','USD']}),f('voice','브랜드 말투'),f('offer','고객에게 약속하는 가치','long')] },
  routine: { title: '이번 주 할 일', description: '작은 실행을 요일별로 정하고 직접 완료를 체크하세요.', fields: [f('week','시작일','date',{required:true}),...['월','화','수','목','금','토','일'].flatMap((d,i)=>[f(`day${i}`,`${d}요일 할 일`),f(`done${i}`,`${d}요일 실행 완료`,'check')])] },
  recipe: { title: '나만의 작업 순서', description: '목적·AI에게 보낼 요청문·절차를 저장해 다음 실행에서 다시 꺼냅니다.', fields:[f('goal','이번 실행 목표','text',{required:true}),f('prompt','AI에게 보낼 요청문','long',{required:true}),f('steps','실행 순서 (한 줄에 하나)','long',{required:true}),f('result','실행 후 배운 점','long')] },
  campaign: { title: '홍보 계획 세우기', description: '유입 → 상세 페이지 → 신청 도착 → 후속 안내까지 연결합니다. 외부 페이지 자동 검사는 하지 않습니다.', fields:[f('audience','대상 고객','text',{required:true}),f('channel','고객이 찾아오는 곳','text',{required:true}),f('entryUrl','고객에게 보여줄 글·영상 링크','url'),f('landingUrl','상세 페이지 링크','url',{required:true}),f('cta','고객의 다음 행동','text',{required:true}),f('applicationUrl','신청 버튼을 누르면 열리는 링크','url',{legacyDefault:''}),f('followupAction','신청 이후 안내·후속 행동','long',{legacyDefault:''}),f('followupUrl','후속 안내 링크 (있다면)','url',{legacyDefault:''}),f('goal','성공을 판단할 수치·기간','text',{required:true}),f('status','진행 상태','select',{choices:['계획','실행 중','마무리']})] },
  checklist: { title: '공개 전 직접 점검', description: '직접 확인한 항목만 체크하세요. 체크는 자동 검수나 승인 증빙이 아닙니다.', fields:[f('url','확인한 페이지 링크','url',{required:true}),f('offer','상품·가격·조건을 직접 확인했어요','check'),f('links','버튼과 이동 링크를 눌러 봤어요','check'),f('mobile','휴대폰에서도 확인했어요','check'),f('claims','근거 없는 성과 보장이 없어요','check'),f('privacy','개인정보·동의·환불 안내를 확인했어요','check'),f('memo','남은 문제·수정 내용','long')] },
  decision: { title: '의사결정 기록', description: '왜 선택했는지 남기면 다음 실험에 판단 근거가 됩니다.', fields:[f('question','결정할 문제','text',{required:true}),f('options','검토한 선택지','long',{required:true}),f('choice','선택한 방향','text',{required:true}),f('reason','선택한 근거','long',{required:true}),f('revisit','다시 확인할 날짜','date'),f('result','돌아보고 배운 점','long')] },
  practice: { title: '혼자 해보기', description: '다른 상품에 배운 원리를 적용하고, 사용한 도움과 다음에 혼자 할 일을 구분합니다.', fields:[f('product','새로 적용할 상품','text',{required:true}),f('principle','적용할 원리','long',{required:true}),f('action','도움 없이 해볼 실행','long',{required:true}),f('result','실행 결과·막힌 점','long'),f('support','이번에 사용한 도움','select',{choices:['진행 중','혼자 완료','수업 자료 참고','AI 도움','멘토 도움'],legacyDefault:'진행 중'}),f('blocked','복습할 키워드·막힌 항목','text',{legacyDefault:''}),f('reflection','다음에는 혼자 할 수 있는 것','long',{legacyDefault:''}),f('next','다음에 바꿀 것','long')] },
  rehearsal: { title: '고객과 대화 연습', description: '실제 고객을 예측하는 AI가 아닌, 인터뷰 준비용 질문 가이드입니다.', fields:[f('audience','대화할 고객 유형','text',{required:true}),f('question','고객에게 물어볼 질문','long',{required:true}),f('answer','실제 들은 답변 또는 연습 답변 (구분해서 작성)','long'),f('insight','다음에 확인할 예상','long')] },
  experiment: { title: '실험 노트', description: '잘 안 된 시도도 비공개로 남겨 다음 실험의 자산으로 만듭니다.', fields:[f('hypothesis','확인해 보고 싶은 예상','long',{required:true}),f('action','바꿀 행동 하나','long',{required:true}),f('measure','비교할 숫자·결과 판단 기준','text',{required:true}),f('start','시작일','date',{required:true}),f('end','마무리일','date',{required:true}),f('status','실험 상태','select',{choices:['계획','진행 중','가설 지지','가설 기각','판단 보류']}),f('result','실제로 관찰한 결과','long'),f('learning','다음 실험에 반영할 배움','long')] },
  metric: { title: '성과 기록', description: '기간과 단위를 맞춰 내 실행 변화를 기록합니다. 모든 수치는 본인 입력입니다.', fields:[f('stage','기록 구분','select',{choices:['시작점','체크인']}),f('start','집계 시작일','date',{required:true}),f('end','집계 종료일','date',{required:true}),f('actions','마케팅 실행 횟수','number',{required:true,max:1e6}),f('leads','문의 수','number',{required:true,max:1e9}),f('revenue','매출','number',{required:true,max:1e12}),f('currency','금액 단위','select',{choices:['KRW','USD']}),f('minutes','마케팅에 쓴 시간 (분)','number',{required:true,max:527040}),f('evidenceUrl','참고 자료 링크 (검증 전)','url'),f('note','집계 기준·외부 요인','long')] },
  review: { title: '고객 테스트 기록', description: '지금은 나만 보는 테스트 계획·관찰 기록입니다. 외부 초대나 공개 링크를 만들지 않습니다.', fields:[f('url','테스트할 사이트 링크','url',{required:true}),f('audience','참여자 유형 (실명·연락처 제외)','text',{required:true}),f('task','참여자가 해볼 일','long',{required:true}),f('observation','실제로 관찰한 어려움·발언 (개인정보 제외)','long'),f('change','관찰 후 바꿀 점','long')] },
  case: { title: '성과 사례 후보', description: '공유하고 싶은 내용만 따로 정리합니다. 후보를 저장해도 외부에 공개되지 않습니다.', fields:[f('summary','공유하고 싶은 배움','long',{required:true}),f('evidence','내용을 확인할 수 있는 기록·기간','long',{required:true}),f('limits','해석할 때 주의할 점','long',{required:true}),f('permission','이 내용을 사례 후보로 검토하고 싶어요','check')] },
} satisfies Record<string,{title:string;description:string;fields:Field[]}>;
export type BusinessKind = keyof typeof businessKinds;
export type Payload = Record<string,string|number|boolean>;
// Keep persisted choices stable; only their presentation is translated.
const choiceLabels:Record<string,string>={'시작점':'처음 기록','체크인':'최근 성과 기록','가설 지지':'예상과 맞았어요','가설 기각':'예상과 달랐어요','판단 보류':'아직 판단하기 어려워요','KRW':'원 (대한민국)','USD':'달러 (미국)'};
export function businessDisplayValue(kind:BusinessKind,key:string,value:unknown):string {
 const field=(businessKinds[kind].fields as Field[]).find(f=>f.key===key);
 return field?.type==='select' ? choiceLabels[String(value)]??String(value) : String(value);
}

export function businessRecordText(kind:string,payload:Record<string,unknown>):string {
 const known=Object.hasOwn(businessKinds,kind);
 const fields=known?businessKinds[kind as BusinessKind].fields as Field[]:[];
 return Object.entries(payload).map(([key,value])=>{
  const label=fields.find(f=>f.key===key)?.label||key;
  const text=typeof value==='boolean'?(value?'예':'아니오'):known?businessDisplayValue(kind as BusinessKind,key,value):String(value);
  return `${label}: ${text}`;
 }).join('\n');
}
export type BusinessRecord = { id:string;user_id:string;enrollment_id:string;kind:BusinessKind;title:string;payload:Payload;revision:number;created_at:string;updated_at:string;archived_at:string|null;last_command_id:string;creation_fingerprint:string };
export type BusinessState = { records:BusinessRecord[];nextCursor:string|null };
export class BusinessError extends Error { constructor(public status:number, message:string) {super(message);} }
export const validId = (v:unknown):v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function fail(status=400):never { throw new BusinessError(status,'사업 기록 요청을 확인해 주세요.'); }
export function safeUrl(raw:string): boolean {
  try {const url=new URL(raw);const host=url.hostname.toLowerCase();return ['https:','http:'].includes(url.protocol) && !url.username && !url.password && !host.includes(':') && !/^\d+(\.\d+){3}$/.test(host) && host.includes('.') && !/(^|\.)(localhost|local|internal)$/.test(host);}catch{return false;}
}
const validDate = (v:string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
export function emptyPayload(kind:BusinessKind):Payload {return Object.fromEntries((businessKinds[kind].fields as Field[]).map(field=>[field.key,field.type==='check'?false:field.type==='select'?field.choices![0]:field.type==='number'&&kind!=='metric'?0:'']));}
export function validatePayload(kind:unknown,value:unknown):Payload {
  if(typeof kind!=='string'||!Object.hasOwn(businessKinds,kind)||!value||typeof value!=='object'||Array.isArray(value))fail();
  const fields=businessKinds[kind as BusinessKind].fields as Field[], input=value as Record<string,unknown>;
  if(Object.keys(input).some(key=>!fields.some(field=>field.key===key)))fail();
  const output:Payload={};
  for(const field of fields){const v=input[field.key]===undefined&&field.legacyDefault!==undefined?field.legacyDefault:input[field.key];
    if(field.type==='check'){if(typeof v!=='boolean')fail();output[field.key]=v;continue;}
    if(field.type==='number'){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>(field.max??1e12)||(field.key!=='price'&&field.key!=='revenue'&&!Number.isInteger(v)))fail();output[field.key]=v;continue;}
    if(typeof v!=='string')fail();const trimmed=v.trim();
    if(trimmed.length>(field.type==='long'?4000:500)||(field.required&&!trimmed))fail();
    if(field.type==='select'&&!field.choices?.includes(trimmed))fail();
    if(trimmed&&field.type==='url'&&!safeUrl(trimmed))fail();
    if(trimmed&&field.type==='date'&&!validDate(trimmed))fail();
    output[field.key]=trimmed;
  }
  if((kind==='metric'||kind==='experiment')&&String(output.start)>String(output.end))fail();
  if(kind==='metric'&&((Date.parse(String(output.end))-Date.parse(String(output.start)))/864e5>365||Number(output.minutes)>((Date.parse(String(output.end))-Date.parse(String(output.start)))/864e5+1)*1440))fail();
  if(kind==='experiment'&&['가설 지지','가설 기각'].includes(String(output.status))&&!String(output.result).trim())fail();
  if(kind==='routine'&&[0,1,2,3,4,5,6].some(i=>output[`done${i}`]===true&&!String(output[`day${i}`]).trim()))fail();
  return output;
}
export function validateTitle(value:unknown):string {if(typeof value!=='string'||!value.trim()||value.trim().length>120)fail();return value.trim();}
export function fingerprint(kind:BusinessKind,title:string,payload:Payload){return JSON.stringify({kind,title,payload:validatePayload(kind,payload)});}
export function comparison(records:BusinessRecord[]){
  const metrics=records.filter(r=>r.kind==='metric'&&!r.archived_at).toSorted((a,b)=>String(a.payload.end).localeCompare(String(b.payload.end))||a.created_at.localeCompare(b.created_at));
  const base=metrics.find(r=>r.payload.stage==='시작점'),latest=metrics.toReversed().find(r=>r.payload.stage==='체크인');
  if(!base||!latest)return {reason:'시작할 때와 최근 성과를 각각 기록하면 비교할 수 있어요.',base,latest,deltas:null};
  const days=(r:BusinessRecord)=>(Date.parse(String(r.payload.end))-Date.parse(String(r.payload.start)))/864e5+1;
  if(base.payload.currency!==latest.payload.currency||days(base)!==days(latest)||String(base.payload.end)>=String(latest.payload.start))return {reason:'금액 단위·기간 길이가 같고 서로 겹치지 않는 기록만 비교합니다.',base,latest,deltas:null};
  return {reason:'본인 입력 기준의 변화입니다. 교육으로 인한 효과나 검증된 성과를 뜻하지 않습니다.',base,latest,deltas:Object.fromEntries(['actions','leads','revenue','minutes'].map(k=>[k,Number(latest.payload[k])-Number(base.payload[k])]))};
}
export const recipeTemplates=[{name:'고객 문제를 좁히기',prompt:'[고객]이 [상황]에서 겪는 문제를 관찰 가능한 행동으로 바꿔 주세요. 사실과 가정을 구분하고 검증 질문 3개를 제안해 주세요.',steps:'최근 고객 상황 한 개 기록\n사실과 가정 구분\n고객 한 명에게 질문\n답을 기록하고 예상 수정'},{name:'한 문장 제안 만들기',prompt:'[상품]의 고객은 [고객]이고 해결할 문제는 [문제]입니다. [말투]로 제안 문장 3개를 작성하되 근거 없는 성과 보장은 하지 마세요.',steps:'내 사업 계획 확인\n문장 세 개 비교\n실제 고객 반응 듣기\n선택한 문장과 이유 기록'},{name:'작은 홍보 시도',prompt:'[상품]을 [고객]에게 알리는 작은 실험을 설계해 주세요. 확인할 예상 하나, 바꿀 요소 하나, 측정할 수치와 기간을 적어 주세요.',steps:'확인할 예상 하나 작성\n유입 콘텐츠와 상세 페이지 연결\n직접 공개 전 점검\n정한 기간 후 수치 기록'}];
export function applyBrief(template:string,brief?:Payload){return template.replace(/\[(상품|고객|문제|말투)\]/g,(original,key:string)=>String(brief?.[({상품:'product',고객:'customer',문제:'problem',말투:'voice'} as Record<string,string>)[key]]||original));}
export const resourcePaths={ '온라인 상품':['고객','제안','상세','광고','콘텐츠'], '전문 서비스':['고객','문제','인터뷰','제안','콘텐츠'], '교육·콘텐츠':['고객','콘텐츠','기획','제안','광고'] };
export function findResources(snapshot:CampusSnapshot,query:string){const words=query.split(/[\s,·]+/).map(w=>w.trim()).filter(w=>w.length>1);return snapshot.lessons.map(lesson=>({lesson,score:words.reduce((n,w)=>n+(lesson.title.toLowerCase().includes(w.toLowerCase())?1:0),0)})).filter(x=>x.score>0).toSorted((a,b)=>b.score-a.score||a.lesson.day-b.lesson.day).slice(0,6).map(x=>x.lesson);}
export function rehearsalQuestions(brief?:Payload){return [`${brief?.customer||'고객'}이 마지막으로 이 문제를 겪은 때는 언제였나요?`,`지금은 ${brief?.problem||'그 문제'}를 어떻게 해결하고 있나요?`,`${brief?.product||'상품'}의 제안을 이해하기 어려운 부분이 있나요?`];}
export function exportBusiness(records:BusinessRecord[]){return JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),visibility:'owner-private',measurement:'self-reported; not independently verified; no causal attribution',records:records.filter(r=>!r.archived_at).map(({id,kind,title,payload,revision,created_at,updated_at})=>({id,kind,title,payload,revision,created_at,updated_at}))},null,2);}
