import { createHash } from 'node:crypto';
import { campusError,isCampusId } from '../snapshot';
import { readLimitedUtf8Body } from './request-body';
import { portfolioFileSpec,matchesPortfolioFile,portfolioFileLimit,type PortfolioFile } from './files';
export type FilePorts={list:(postId:string)=>Promise<PortfolioFile[]>;owned:(id:string)=>Promise<PortfolioFile>;readable:(id:string)=>Promise<PortfolioFile>;prepare:(c:Record<string,unknown>)=>Promise<PortfolioFile>;share:(c:Record<string,unknown>)=>Promise<unknown>;signedUpload:(file:PortfolioFile)=>Promise<string>;signedDownload:(file:PortfolioFile)=>Promise<string>;read:(file:PortfolioFile)=>Promise<{bytes:Uint8Array;contentType:string}>;complete:(id:string,hash:string)=>Promise<unknown>};
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
const meta=(f:PortfolioFile)=>({id:f.id,name:f.name,size:f.size,contentType:f.content_type,revision:f.post_revision,ready:f.state==='ready',visibility:f.visibility,accessRevision:f.revision});
export async function handlePortfolioFiles(req:Request,d:{enabled:boolean;authenticate:()=>Promise<{id:string}|null>;ports:(actor:string)=>Promise<FilePorts>}){
 const reply=(value:unknown,status=200)=>Response.json(value,{status,headers});
 if(!d.enabled)return reply({error:'준비 중입니다.'},404);
 try{if(!['GET','POST'].includes(req.method))return reply({error:'Method'},405);const url=new URL(req.url);
 if(req.method==='POST'&&(req.headers.get('origin')!==url.origin||req.headers.get('sec-fetch-site')==='cross-site'))return reply({error:'Origin'},403);
 const viewer=await d.authenticate();if(!viewer)return reply({error:'로그인이 필요합니다.'},401);const ports=await d.ports(viewer.id);
 if(req.method==='GET'){
  const postId=url.searchParams.get('postId');if(postId){if(!isCampusId(postId))campusError(400,'작업물을 선택해 주세요.');return reply({files:(await ports.list(postId)).map(meta)});}
  const id=url.searchParams.get('fileId');if(!isCampusId(id??''))campusError(400,'파일을 선택해 주세요.');const f=await ports.readable(id!);if(f.state!=='ready'||!f.sha256||f.size>portfolioFileLimit)campusError(409,'파일 검증이 끝나지 않았어요.');
  const signed=await ports.signedDownload(f);return new Response(null,{status:302,headers:{...headers,Location:signed,'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
 }
 if(!req.headers.get('content-type')?.startsWith('application/json'))campusError(400,'요청 형식을 확인해 주세요.');let b:Record<string,unknown>;try{b=JSON.parse(await readLimitedUtf8Body(req,5000));}catch{campusError(400,'요청 형식을 확인해 주세요.');}if(!b||typeof b!=='object'||Array.isArray(b))campusError(400,'요청 형식을 확인해 주세요.');
 if(b.action==='prepare'){
  if(!isCampusId(String(b.postId??''))||!isCampusId(String(b.requestId??''))||!Number.isSafeInteger(b.expectedRevision)||Number(b.expectedRevision)<1)campusError(400,'작업물 버전을 확인해 주세요.');
  const spec=portfolioFileSpec(b.name,b.size),f=await ports.prepare({requestId:b.requestId,postId:b.postId,expectedRevision:b.expectedRevision,...spec});if(f.owner_id!==viewer.id)campusError(403,'내 파일만 올릴 수 있어요.');
  return reply({...meta(f),...(f.state==='pending'?{signedUrl:await ports.signedUpload(f)}:{})});
 }
 if(b.action==='share'){
  if(!isCampusId(String(b.fileId??''))||!isCampusId(String(b.requestId??''))||!Number.isSafeInteger(b.expectedRevision)||Number(b.expectedRevision)<1||!['private','cohort'].includes(String(b.visibility))||(b.visibility==='cohort'&&b.confirmed!==true))campusError(400,'파일 공유 범위를 별도로 확인해 주세요.');
  return reply(await ports.share({requestId:b.requestId,fileId:b.fileId,expectedRevision:b.expectedRevision,visibility:b.visibility,confirmed:b.visibility==='cohort'}));
 }
 if(b.action!=='complete'||!isCampusId(String(b.fileId??'')))campusError(400,'파일을 확인해 주세요.');const f=await ports.owned(String(b.fileId));if(f.owner_id!==viewer.id)campusError(403,'내 파일만 확인할 수 있어요.');
 if(f.state==='ready')return reply(meta(f));const value=await ports.read(f);if(value.contentType!==f.content_type||!matchesPortfolioFile(value.bytes,{size:f.size,contentType:f.content_type}))campusError(400,'파일 내용과 이름·용량이 맞지 않습니다. 원본을 확인해 주세요.');
 await ports.complete(f.id,createHash('sha256').update(value.bytes).digest('hex'));return reply({...meta(f),ready:true});
 }catch(e){const status=e instanceof Error&&'status'in e&&[400,403,409].includes(Number(e.status))?Number(e.status):503;return reply({error:status===403?'이 파일을 이용할 권한이 없어요.':status===409?'작업물 버전 또는 업로드 상태가 바뀌었어요. 다시 확인해 주세요.':status===400?'파일 형식·내용·용량 또는 입력 정보를 확인해 주세요.':'파일을 처리하지 못했습니다. 다시 시도해 주세요.'},status);}
}
