'use client';
import { useEffect,useRef,useState } from 'react';
import type { CommunityPost } from './domain';
import { checkPortfolioFile,uploadPortfolioFile,sharePortfolioFile,demoUploads } from './upload';
import styles from './panel.module.css';
import { useCampusDraftGuard } from '../ui/draft-guard';
type Item={id:string;name:string;size:number;contentType:string;revision:number;ready:boolean;url?:string;visibility:'private'|'cohort';accessRevision:number};
export function PortfolioFiles({post,demo,owner,version=0}:{post:CommunityPost;demo:boolean;owner:boolean;version?:number}){
 const [files,setFiles]=useState<Item[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState<Record<string,boolean>>({});const urls=useRef<string[]>([]),mounted=useRef(true),lock=useRef(false);
 useCampusDraftGuard(Object.values(confirmed).some(Boolean),busy);
 async function refresh(){const r=await fetch('/api/campus/community/files?postId='+post.id,{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);if(mounted.current)setFiles(d.files);}
 useEffect(()=>{mounted.current=true;if(!demo)void refresh().catch(e=>setError(e.message));return()=>{mounted.current=false;urls.current.forEach(URL.revokeObjectURL);};},[post.id,demo]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{void Promise.resolve().then(()=>{if(!mounted.current)return;if(demo){const waiting=demoUploads.get(post.id);if(waiting){demoUploads.delete(post.id);void Promise.all(waiting.files.map(async file=>{const spec=await checkPortfolioFile(file),url=URL.createObjectURL(file);urls.current.push(url);return{id:crypto.randomUUID(),...spec,revision:post.revision,ready:true,url,visibility:waiting.shared?'cohort' as const:'private' as const,accessRevision:1};})).then(items=>{if(mounted.current)setFiles(old=>[...old,...items]);}).catch(e=>setError(e.message));}if(post.visibility==='private'||post.hidden)setFiles(old=>old.map(f=>({...f,visibility:'private',accessRevision:f.visibility==='cohort'?f.accessRevision+1:f.accessRevision})));}else void refresh().catch(e=>setError(e.message));});},[post.visibility,post.hidden,post.revision,demo,version]); // eslint-disable-line react-hooks/exhaustive-deps
 async function upload(input:FileList|File[]){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
  const incoming=Array.from(input);if(incoming.length>4||files.length+incoming.length>20)throw Error('한 번에 4개, 작업물마다 총 20개까지 첨부할 수 있어요.');
  for(const file of incoming){
   if(demo){const spec=await checkPortfolioFile(file),url=URL.createObjectURL(file);urls.current.push(url);setFiles(old=>[...old,{id:crypto.randomUUID(),...spec,revision:post.revision,ready:true,url,visibility:'private',accessRevision:1}]);continue;}
   await uploadPortfolioFile(post.id,post.revision,file);
  }if(!demo)await refresh();
 }catch(e){setError((e as Error).message);}finally{lock.current=false;if(mounted.current)setBusy(false);}}
 async function changeAccess(f:Item,visibility:'private'|'cohort'){if(lock.current||!owner)return;lock.current=true;setBusy(true);setError('');try{if(visibility==='cohort'&&(!confirmed[f.id]||post.visibility!=='cohort'||post.hidden))throw Error('게시글을 기수에 공유하고 파일 공개도 별도로 확인해 주세요.');if(demo)setFiles(old=>old.map(x=>x.id===f.id?{...x,visibility,accessRevision:x.accessRevision+1}:x));else{await sharePortfolioFile(f,visibility);await refresh();}setConfirmed(old=>({...old,[f.id]:false}));}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 if(!owner&&!files.length)return null;
 return <section className={styles.fileDrop} aria-label="작업물 첨부" tabIndex={owner?0:undefined} onDragOver={e=>{if(owner&&e.dataTransfer.types.includes('Files'))e.preventDefault();}} onDrop={e=>{if(owner&&e.dataTransfer.files.length){e.preventDefault();void upload(e.dataTransfer.files);}}} onPaste={e=>{const input=Array.from(e.clipboardData.items).filter(x=>x.kind==='file').map(x=>x.getAsFile()).filter((x):x is File=>!!x);if(owner&&input.length){e.preventDefault();void upload(input);}}}>
  <strong>{owner?'내 첨부 파일':'동료가 공유한 첨부'}</strong>{owner&&<><small>여기서 더 올린 파일은 처음에는 나만 볼 수 있어요. 고객 이름·연락처 등 개인정보를 지운 뒤, 공유할 파일만 따로 선택해 주세요.</small>
  <label>캡처·PDF 파일 첨부<input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf" disabled={busy} onChange={e=>{if(e.target.files)void upload(e.target.files);e.target.value='';}}/></label><small>여기에 파일을 끌어 놓거나 캡처를 붙여넣으세요. 파일당 최대 10MB · 현재 v{post.revision}에 보관{demo?' · 이 체험에서는 브라우저 메모리에만 보관됩니다.':''}</small></>}
  {busy&&<p role="status">파일을 확인하고 있어요.</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}
  {files.some(f=>f.ready&&f.contentType.startsWith('image/'))&&<div className={styles.fileImages}>{files.filter(f=>f.ready&&f.contentType.startsWith('image/')).map(f=>{const src=demo?f.url:'/api/campus/community/files?fileId='+f.id;return <a key={f.id} href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt={f.name} loading="lazy"/></a>;})}</div>}
  {files.map(f=><div className={styles.fileAccess} key={f.id}><div className={styles.fileItem}><span>{f.name} · {Math.ceil(f.size/1024)}KB · v{f.revision} · {f.visibility==='cohort'?'기수 공개':'나만 보기'}{!f.ready?' · 업로드 미완료':''}</span>{f.ready&&<a href={demo?f.url:'/api/campus/community/files?fileId='+f.id} download={f.name}>{owner?'내 파일 다운로드':'공유 파일 다운로드'}</a>}</div>{owner&&f.ready&&(f.visibility==='cohort'?<button className={styles.textButton} disabled={busy} onClick={()=>void changeAccess(f,'private')}>이 파일 공유 철회</button>:<><label className={styles.check}><input type="checkbox" checked={confirmed[f.id]??false} onChange={e=>setConfirmed(old=>({...old,[f.id]:e.target.checked}))}/> 이 파일을 같은 기수에 공개합니다</label><button className={styles.secondary} disabled={busy||!confirmed[f.id]||post.visibility!=='cohort'} onClick={()=>void changeAccess(f,'cohort')}>확인한 파일 기수에 공유</button></>)}</div>)}
  {!!files.length&&<small>열 때마다 접근 권한을 확인합니다. 공유 철회 후 새 다운로드는 차단되며, 이미 발급된 링크는 최대 30초 후 만료돼요. 받은 파일 자체는 회수할 수 없습니다.</small>}
 </section>;
}
