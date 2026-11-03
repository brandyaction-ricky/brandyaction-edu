import type {CampusSnapshot} from '../contracts';
import {businessKinds,findResources,type BusinessRecord,type Field,type Payload} from './domain';

export type BusinessHandoff={lessonId:string;context:string};
export type BusinessConnections={onAsk?:(input:BusinessHandoff)=>void;onOpenLesson?:(lessonId:string)=>void};
export const briefSelectionFields=(businessKinds.brief.fields as Field[]).filter(f=>f.key!=='currency');
export function briefContext(payload:Payload,selected:string[]){
 const fields=briefSelectionFields.filter(f=>selected.includes(f.key));
 return fields.length?'사용자가 선택해 포함한 사업 배경 (본인 입력, 사실 검증 전)\n'+fields.map(f=>`${f.label}: ${String(payload[f.key]??'')}${f.key==='price'?' '+String(payload.currency||'KRW'):''}`).join('\n'):'';
}
type Stage={title:string;goal:string;action:string;words:string[]};
const common:Stage[]=[
 {title:'고객 문제',goal:'한 고객의 구체적인 상황을 정합니다.',action:'최근 관찰한 문제 하나와 아직 모르는 점을 기록합니다.',words:['고객','문제','욕구']},
 {title:'제안 구성',goal:'고객의 문제와 상품의 약속을 연결합니다.',action:'누구에게 무엇을 바꿔 주는지 한 문장으로 적습니다.',words:['제안','상품','기획']},
 {title:'작은 공개 실험',goal:'관찰 가능한 작은 행동으로 검증합니다.',action:'한 채널·한 요청·한 기간을 정하고 직접 점검합니다.',words:['상세','광고','콘텐츠','랜딩']},
 {title:'관찰과 개선',goal:'반응과 외부 요인을 구분해 다음 실행을 정합니다.',action:'같은 기간의 수치와 고객 발언을 남기고 한 요소만 바꿉니다.',words:['분석','성과','실험','개선']},
];
export const industryGuides={
 '온라인 상품':{goal:'상품의 제안을 작은 판매 실험으로 확인하기',actions:['최근 구매 상황 한 가지 관찰','상품 가치·가격 조건 한 문장','콘텐츠 → 상세 → 신청 경로 직접 확인','문의와 구매 전 이탈 이유 기록']},
 '전문 서비스':{goal:'전문성이 필요한 고객과 상담 제안 연결하기',actions:['의뢰인이 도움을 찾는 상황 기록','상담 범위와 제외 범위 명시','한 채널에서 상담 신청 실험','상담 전 질문과 실제 기대 차이 기록']},
 '교육·콘텐츠':{goal:'학습자의 문제와 작은 학습 경험 연결하기',actions:['학습자가 못 하고 있는 행동 관찰','경험 후 할 수 있는 행동 명시','예시 콘텐츠 → 체험 신청 연결','완료 경험과 어려운 지점 기록']},
};
export function industryPath(snapshot:CampusSnapshot,industry:keyof typeof industryGuides){return common.map((s,i)=>({...s,id:`stage-${i}`,action:industryGuides[industry].actions[i],prerequisite:i?common[i-1].title:null,lessons:findResources(snapshot,s.words.join(' '))}));}
export function campaignStages(p:Payload){return [
 {name:'유입',detail:String(p.channel||''),url:String(p.entryUrl||''),complete:Boolean(p.channel&&p.entryUrl),missing:'유입 채널과 콘텐츠 URL'},
 {name:'상세',detail:'제안·조건 안내',url:String(p.landingUrl||''),complete:Boolean(p.landingUrl),missing:'상세 페이지 URL'},
 {name:'행동 요청',detail:String(p.cta||''),url:'',complete:Boolean(p.cta),missing:'고객이 할 다음 행동'},
 {name:'신청 도착',detail:'신청·구매를 마칠 위치',url:String(p.applicationUrl||''),complete:Boolean(p.applicationUrl),missing:'신청 도착 URL'},
 {name:'후속 안내',detail:String(p.followupAction||''),url:String(p.followupUrl||''),complete:Boolean(p.followupAction),missing:'신청 이후 안내·후속 행동'},
 ];}
export function rehearsalFollowup(answer:string){
 const a=answer.trim();if(!a)return '첫 답변을 적으면 그 내용에 따라 다음 반문을 고릅니다.';
 if(/무조건|반드시|보장|100%|확실/.test(a))return '그 결과를 보장할 수 있는 근거가 있나요? 고객에게 약속할 범위와 예외를 나누어 설명해 주세요.';
 if(!/[0-9]|최근|어제|지난|한 번|예를/.test(a))return '설명을 실제 상황 한 가지로 보여 주실 수 있나요? 언제, 누가, 어떤 어려움을 겪었는지 구체적으로 말해 주세요.';
 return '고객이 지금 쓰는 다른 방법과 무엇이 다른가요? 가격·시간·불편 중 어떤 교환이 필요한지 설명해 주세요.';
}
export function rehearsalCheck(p:Payload){return [
 {label:'첫 설명을 내 말로 작성',done:String(p.answer||'').trim().length>=10},
 {label:'추가 반문에 구체적으로 답변',done:String(p.insight||'').trim().length>=10},
 {label:'보장 표현을 점검',done:!/(무조건|100%|반드시 성공)/.test(String(p.answer||'')+' '+String(p.insight||''))},
 ];}
export function practiceContext(p:Payload){return `독립 실행 실습 도움 요청 (본인 입력)\n새 상품: ${p.product||''}\n적용할 원리: ${p.principle||''}\n직접 해본 실행: ${p.action||''}\n막힌 지점: ${p.blocked||p.result||''}\n사용한 도움: ${p.support||'진행 중'}\n완성 답안을 대신 만들기보다 다음에 혼자 할 수 있는 작은 힌트를 주세요.`;}
export function outcomeSeries(records:BusinessRecord[],currency:string){
 return records.filter(r=>r.kind==='metric'&&!r.archived_at&&r.payload.currency===currency).toSorted((a,b)=>String(a.payload.end).localeCompare(String(b.payload.end))||a.created_at.localeCompare(b.created_at)).map(r=>({id:r.id,label:`${r.payload.start} ~ ${r.payload.end}`,actions:Number(r.payload.actions),leads:Number(r.payload.leads),revenue:Number(r.payload.revenue),minutes:Number(r.payload.minutes)}));
}
export function learningFacts(snapshot:CampusSnapshot){const missions=snapshot.lessons.flatMap(l=>l.missions);return {lessons:snapshot.lessons.length,completed:snapshot.lessons.filter(l=>l.completed).length,missions:missions.length,approved:missions.filter(m=>m.status==='approved').length,submitted:missions.filter(m=>m.status==='submitted').length};}
