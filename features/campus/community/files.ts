import { campusError } from '../snapshot';
export const portfolioFileLimit=10*1024*1024;
export type PortfolioFile={id:string;owner_id:string;post_id:string;post_revision:number;name:string;size:number;content_type:string;path:string;state:'pending'|'ready';sha256:string|null;created_at:string;visibility:'private'|'cohort';revision:number};
export function portfolioFileSpec(name:unknown,size:unknown){
 if(typeof name!=='string'||!name.trim()||name.length>180||/[\\/\u0000-\u001f\u007f]/.test(name)||!Number.isSafeInteger(size)||Number(size)<1||Number(size)>portfolioFileLimit)campusError(400,'이름이 올바른 10MB 이하 파일을 선택해 주세요.');
 const ext=name.split('.').pop()?.toLowerCase()??'';const contentType:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',pdf:'application/pdf'};
 if(!contentType[ext])campusError(400,'PNG·JPG·WEBP 이미지 또는 PDF를 선택해 주세요.');
 return{name:name.normalize('NFC').trim(),size:Number(size),contentType:contentType[ext]};
}
export function matchesPortfolioFile(bytes:Uint8Array,spec:{size:number;contentType:string}){
 if(bytes.length!==spec.size||bytes.length>portfolioFileLimit)return false;
 const starts=(...v:number[])=>v.every((n,i)=>bytes[i]===n),ascii=(a:number,b:number)=>String.fromCharCode(...bytes.slice(a,b));
 return spec.contentType==='image/png'?starts(137,80,78,71,13,10,26,10):spec.contentType==='image/jpeg'?starts(255,216,255):spec.contentType==='image/webp'?ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP':spec.contentType==='application/pdf'?ascii(0,5)==='%PDF-':false;
}
