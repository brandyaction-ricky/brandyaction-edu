import { campusError } from '../snapshot';
export const portfolioFileLimit=10*1024*1024;
export type PortfolioFile={id:string;owner_id:string;post_id:string;post_revision:number;name:string;size:number;content_type:string;path:string;state:'pending'|'ready';sha256:string|null;created_at:string;visibility:'private'|'cohort';revision:number;removed_at?:string|null};
/** A video preview is kept this long from upload; pictures and PDFs stay. */
export const videoRetentionDays=30;
export const isVideoType=(contentType:string)=>contentType.startsWith('video/');
export function videoExpiry(file:{content_type:string;created_at:string;removed_at?:string|null},now=Date.now()){
 if(!isVideoType(file.content_type))return{expiresAt:null,expired:false};
 const at=Date.parse(file.created_at)+videoRetentionDays*86400000;
 return{expiresAt:new Date(at).toISOString(),expired:!!file.removed_at||now>=at};
}
export function portfolioFileSpec(name:unknown,size:unknown){
 if(typeof name!=='string'||!name.trim()||name.length>180||/[\\/\u0000-\u001f\u007f]/.test(name)||!Number.isSafeInteger(size)||Number(size)<1||Number(size)>portfolioFileLimit)campusError(400,'이름이 올바른 10MB 이하 파일을 선택해 주세요.');
 const ext=name.split('.').pop()?.toLowerCase()??'';const contentType:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',pdf:'application/pdf',mp4:'video/mp4',webm:'video/webm'};
 if(!contentType[ext])campusError(400,'PNG·JPG·WEBP 이미지, PDF 또는 MP4·WEBM 영상을 선택해 주세요.');
 return{name:name.normalize('NFC').trim(),size:Number(size),contentType:contentType[ext]};
}
export function matchesPortfolioFile(bytes:Uint8Array,spec:{size:number;contentType:string}){
 if(bytes.length!==spec.size||bytes.length>portfolioFileLimit)return false;
 const starts=(...v:number[])=>v.every((n,i)=>bytes[i]===n),ascii=(a:number,b:number)=>String.fromCharCode(...bytes.slice(a,b));
 return spec.contentType==='image/png'?starts(137,80,78,71,13,10,26,10):spec.contentType==='image/jpeg'?starts(255,216,255):spec.contentType==='image/webp'?ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP':spec.contentType==='application/pdf'?ascii(0,5)==='%PDF-':spec.contentType==='video/mp4'?ascii(4,8)==='ftyp':spec.contentType==='video/webm'?starts(26,69,223,163):false;
}
