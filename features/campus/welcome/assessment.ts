import preset from './cohort-five.json';
export type WelcomeAssessment={quiz:{question:string;answer:boolean;explanation:string}[];level:{question:string;options:string[]}[]};
export const DEFAULT_ASSESSMENT:WelcomeAssessment=preset.assessment;
export function startingPoint(answers:number[]){
 const score=answers.reduce((sum,n)=>sum+Math.max(0,n),0),ratio=score/Math.max(1,answers.length*2);
 return {score,title:ratio<=5/16?'처음부터 함께 시작해요':ratio<=11/16?'알고 있는 것에 연결을 더해요':'내 일에 적용할 준비를 해요',recommendation:ratio<=5/16?'처음 접하는 말이 많아도 괜찮아요. AI 기초 지식 1~4번에서 AI와 도구의 역할부터 하나씩 알아보세요.':ratio<=11/16?'AI를 써본 경험에 연결을 더해 보세요. AI 기초 지식 5~7번에서 내 사업 자료와 도구를 연결하는 흐름을 살펴보세요.':'필요한 자료와 도구를 연결해 반복 업무를 다룰 준비를 해 보세요. AI 기초 지식 5~7번에서 스킬과 프로젝트의 기초를 확인하세요.'};
}
export function validateAssessment(value:unknown):WelcomeAssessment{
 const fail=():never=>{throw Object.assign(Error('AI 수준 확인·OX 퀴즈의 질문과 선택지를 확인해 주세요.'),{status:400});};
 if(!value||typeof value!=='object')return fail();const v=value as WelcomeAssessment;
 const text=(s:unknown,max:number):s is string=>typeof s==='string'&&!!s.trim()&&s.length<=max;
 if(Object.keys(v).some(k=>!['quiz','level'].includes(k))||!Array.isArray(v.quiz)||!Array.isArray(v.level)||v.quiz.length<1||v.quiz.length>20||v.level.length<1||v.level.length>12)return fail();
 return {quiz:v.quiz.map(q=>{if(!q||Object.keys(q).some(k=>!['question','answer','explanation'].includes(k))||!text(q.question,400)||typeof q.answer!=='boolean'||!text(q.explanation,1200))return fail();return{question:q.question.trim(),answer:q.answer,explanation:q.explanation.trim()};}),level:v.level.map(q=>{if(!q||Object.keys(q).some(k=>!['question','options'].includes(k))||!text(q.question,400)||!Array.isArray(q.options)||q.options.length!==3||!q.options.every(s=>text(s,250)))return fail();return{question:q.question.trim(),options:q.options.map(s=>s.trim())};})};
}
