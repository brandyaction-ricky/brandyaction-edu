import type { AuthorPayload } from './lesson-author-drafts';
import { lessonBodyPlainText } from './lesson-body';

export type AuthorConflict = { key: string; label: string; mine: string; latest: string };
export type AuthorChoices = Record<string, 'mine' | 'latest'>;
export function authorValuesEqual(a: unknown, b: unknown): boolean {
  if(Object.is(a,b))return true;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((item,index)=>authorValuesEqual(item,b[index]));
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>;
  const keys=Object.keys(left).filter(key=>left[key]!==undefined),other=Object.keys(right).filter(key=>right[key]!==undefined);
  return keys.length===other.length&&keys.every(key=>Object.hasOwn(right,key)&&authorValuesEqual(left[key],right[key]));
}
const same=authorValuesEqual;
function preview(value: unknown): string {
  if (value === undefined) return '삭제한 항목';
  if (typeof value === 'string') return lessonBodyPlainText(value) || '(비어 있음)';
  if (typeof value === 'boolean') return value ? '켜짐' : '꺼짐';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(preview).join('\n');
  const row = value as Record<string, unknown>;
  if (!row) return '(비어 있음)';
  const labels: Record<string, string> = { content:'내용', url:'주소', alt:'파일 설명', label:'문구', variable:'입력 이름', placeholder:'입력 예시', required:'필수 입력', sensitive:'개인 정보', kind:'답변 방식', passPercent:'통과 점수', prompt:'문제', options:'선택지', correctIndex:'정답 번호', mode:'완료 방식', requireAnswers:'답변 필요', requireQuizPass:'퀴즈 통과 필요', track:'학습 분류', dayNumber:'진행 일차', tag:'태그', tagLabel:'태그 이름', toolVersion:'도구 버전' };
  return Object.entries(row).flatMap(([key,item]) => key === 'id' || key === 'type' ? [] : key === 'assetId' ? ['첨부 파일이 등록되어 있습니다.'] : [labels[key] ? `${labels[key]}: ${key==='correctIndex' ? Number(item)<0 ? '미지정' : String(Number(item)+1) : preview(item)}` : preview(item)]).join('\n') || '등록된 학습 항목';
}

// Three-way comparison uses the editor's acknowledged baseline, never a last-
// writer-wins overwrite. Overlapping edits require an explicit field choice.
export function mergeAuthorDraft(base: AuthorPayload, mine: AuthorPayload, latest: AuthorPayload, choices: AuthorChoices = {}) {
  const conflicts: AuthorConflict[] = [];
  function field<T>(key: string, label: string, before: T, local: T, remote: T, describe: (value:T)=>string = preview): T {
    if (same(local,before) || same(local,remote)) return structuredClone(remote);
    if (same(remote,before)) return structuredClone(local);
    conflicts.push({key,label,mine:describe(local),latest:describe(remote)});
    return structuredClone(choices[key] === 'latest' ? remote : local);
  }
  function items<T extends {id:string}>(key:string,label:string,before:T[],local:T[],remote:T[]):T[] {
    const old=new Map(before.map(item=>[item.id,item])), own=new Map(local.map(item=>[item.id,item])), other=new Map(remote.map(item=>[item.id,item]));
    const merged=new Map<string,T>();
    for (const id of new Set([...old.keys(),...own.keys(),...other.keys()])) {
      const caption=preview(own.get(id) || other.get(id) || old.get(id)).split('\n')[0].slice(0,80);
      const item=field(`${key}.${id}`,`${label} · ${caption}`,old.get(id),own.get(id),other.get(id));
      if(item)merged.set(id,item);
    }
    const describe=(ids:string[])=>ids.map(id=>preview(own.get(id)||other.get(id)||old.get(id)).split('\n')[0]).join('\n');
    const order=field(`${key}.order`,`${label} 순서`,before.map(x=>x.id),local.map(x=>x.id),remote.map(x=>x.id),describe);
    // Never lose an independently inserted item when one order is selected.
    return [...new Set([...order,...remote.map(x=>x.id),...local.map(x=>x.id)])].filter(id=>merged.has(id)).map(id=>merged.get(id)!);
  }
  const payload=structuredClone(latest);
  const basicLabels={week_id:'주차',day_number:'일차',title:'수업 제목',description:'수업 안내',duration_label:'소요 시간',is_published:'수업 공개',is_preview:'무료 미리보기'};
  for(const key of Object.keys(basicLabels) as (keyof typeof basicLabels)[]) {
    // All basic fields have the same key in the three validated payloads.
    Object.assign(payload.form.basic,{[key]:field(`basic.${key}`,basicLabels[key],base.form.basic[key],mine.form.basic[key],latest.form.basic[key])});
  }
  const formLabels={format:'콘텐츠 유형',bodyText:'학습 본문',videoUrl:'영상 주소',externalUrl:'외부 링크',resourceName:'자료 이름',resourcePath:'자료 파일'};
  for(const key of Object.keys(formLabels) as (keyof typeof formLabels)[]) Object.assign(payload.form,{[key]:field(`form.${key}`,formLabels[key],base.form[key],mine.form[key],latest.form[key])});
  payload.blocks.active=field('blocks.active','학습 구성 사용',base.blocks.active,mine.blocks.active,latest.blocks.active);
  if(mine.blocks.active!==latest.blocks.active && ((mine.blocks.active!==base.blocks.active && !same(latest.blocks.document,base.blocks.document)) || (latest.blocks.active!==base.blocks.active && !same(mine.blocks.document,base.blocks.document)))) {
    conflicts.push({key:'blocks.active',label:'학습 구성 사용',mine:preview(mine.blocks.active),latest:preview(latest.blocks.active)});
    payload.blocks.active=choices['blocks.active']==='latest'?latest.blocks.active:mine.blocks.active;
  }
  const b=base.blocks.document,m=mine.blocks.document,l=latest.blocks.document;
  payload.blocks.document.blocks=items('blocks','학습 항목',b.blocks,m.blocks,l.blocks);
  payload.blocks.document.checklist=items('checklist','완료 항목',b.checklist,m.checklist,l.checklist);
  for(const key of ['completion','progression','presentation'] as const) {
    const value=field(`document.${key}`,{completion:'학습 완료 조건',progression:'학습 진행 설정',presentation:'학습 태그'}[key],b[key],m[key],l[key]);
    if(value === undefined)delete payload.blocks.document[key];else Object.assign(payload.blocks.document,{[key]:value});
  }
  return {payload,conflicts};
}
