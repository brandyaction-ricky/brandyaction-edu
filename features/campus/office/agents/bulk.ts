// 여러 명 한 번에 등록: 한 줄에 한 명 "이름, 봇 주소, 담당 업무(선택)". 표에서 붙여넣은 탭 구분도 받는다.
export type EmployeeLine={line:number;name:string;telegram:string;duties:string};
export function parseEmployeeLines(text:string):EmployeeLine[]{
 return text.split(/\r?\n/).flatMap((raw,index)=>{
  if(!raw.trim())return [];
  const tab=raw.includes('\t'),[name='',telegram='',...rest]=raw.split(tab?'\t':',');
  return [{line:index+1,name:name.trim(),telegram:telegram.trim(),duties:rest.join(tab?' ':',').trim()}];
 });
}
/** 총괄 직원은 총괄 자리(0)에 먼저, 나머지는 1~9번을 채운 뒤 마지막에 총괄 자리. */
export function pickSeat(name:string,taken:number[]):number|undefined{
 return [...(name.includes('총괄')?[0]:[]),1,2,3,4,5,6,7,8,9,0].find(seat=>!taken.includes(seat));
}
