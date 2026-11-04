import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { campusError } from '../snapshot';
import type { FilePorts } from './file-handler';
import type { PortfolioFile } from './files';
const bucket='campus-portfolio-private';
export async function portfolioFilePorts(actor:string):Promise<FilePorts>{
 const db=await createClient(),admin=createAdminClient(),storage=admin.storage.from(bucket);
 const error=(e:{code?:string}|null)=>{if(e)campusError(e.code==='42501'?403:['40001','23505'].includes(e.code??'')?409:['23514','22P02'].includes(e.code??'')?400:503,'파일 처리 실패');};
 return{
  list:async postId=>{const p=await db.from('edu_campus_posts').select('id').eq('id',postId).maybeSingle();if(p.error||!p.data)campusError(403,'현재 볼 수 있는 작업물만 선택해 주세요.');const r=await db.from('edu_campus_portfolio_files').select('*',{count:'exact'}).eq('post_id',postId).order('created_at',{ascending:false}).limit(20);error(r.error);if(!Array.isArray(r.data)||r.count!==r.data.length)campusError(503,'파일 목록을 확인하지 못했습니다.');return r.data as PortfolioFile[];},
  owned:async id=>{const r=await db.from('edu_campus_portfolio_files').select('*').eq('id',id).eq('owner_id',actor).maybeSingle();error(r.error);if(!r.data)campusError(403,'내 파일만 선택해 주세요.');return r.data as PortfolioFile;},
  readable:async id=>{const r=await db.from('edu_campus_portfolio_files').select('*').eq('id',id).maybeSingle();error(r.error);if(!r.data)campusError(403,'현재 공개 범위에서 파일을 열 수 없습니다.');return r.data as PortfolioFile;},
  share:async c=>{const r=await db.rpc('edu_campus_portfolio_file_share',{p_command:c});error(r.error);return r.data;},
  prepare:async c=>{const r=await db.rpc('edu_campus_portfolio_file_prepare',{p_command:c});error(r.error);if(!r.data)campusError(503,'업로드를 준비하지 못했습니다.');return r.data as PortfolioFile;},
  signedUpload:async file=>{const r=await storage.createSignedUploadUrl(file.path,{upsert:false});if(r.error)campusError(503,'업로드를 준비하지 못했습니다.');return r.data.signedUrl;},
  signedDownload:async file=>{const check=await db.from('edu_campus_portfolio_files').select('id').eq('id',file.id).eq('state','ready').maybeSingle();if(check.error||!check.data)campusError(403,'파일 공개 범위가 바뀌었습니다.');const r=await storage.createSignedUrl(file.path,30,{download:file.name});if(r.error)campusError(503,'다운로드를 준비하지 못했습니다.');return r.data.signedUrl;},
  read:async file=>{const info=await storage.info(file.path);if(info.error||info.data.size!==file.size||info.data.contentType!==file.content_type)campusError(400,'파일 정보가 다릅니다.');const r=await storage.download(file.path);if(r.error||r.data.size!==file.size)campusError(503,'파일을 확인하지 못했습니다.');return{bytes:new Uint8Array(await r.data.arrayBuffer()),contentType:info.data.contentType};},
  complete:async(id,hash)=>{const r=await admin.rpc('edu_campus_portfolio_file_complete',{p_actor:actor,p_file:id,p_hash:hash});error(r.error);return r.data;},
 };
}
