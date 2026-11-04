import {libraryPathValid,libraryDownloadPath,libraryFileInput} from './resource-files';
export type CampusResource={id:string;kind:'file'|'youtube';title:string;description:string;url:string;published:boolean;storagePath?:string;fileName?:string};
export function youtubeVideoId(value:string){
 try{const u=new URL(value);if(u.href.length>1200||u.protocol!=='https:'||u.username||u.password||u.port)return null;
 const id=u.hostname==='youtu.be'?u.pathname.slice(1):['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)?u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)$/)?.[1]:null;
 return id&&/^[\w-]{11}$/.test(id)?id:null;}catch{return null;}
}
export function validateResources(value:unknown,slug?:string):CampusResource[]{
 if(value===undefined)return[];
 if(!Array.isArray(value)||value.length>12)throw Object.assign(Error('자료는 최대 12개까지 등록할 수 있어요.'),{status:400});
 const ids=new Set<string>();
 return value.map(v=>{
  const bad=()=>{throw Object.assign(Error('자료 제목·주소·공개 설정을 확인해 주세요.'),{status:400});};
  if(!v||typeof v!=='object'||Object.keys(v).some(k=>!['id','kind','title','description','url','published','storagePath','fileName'].includes(k)))return bad();
  if(typeof v.id!=='string'||!/^[-\w]{1,60}$/.test(v.id)||ids.has(v.id)||!['file','youtube'].includes(v.kind)||typeof v.published!=='boolean')return bad();ids.add(v.id);
  if(typeof v.title!=='string'||!v.title.trim()||v.title.length>80||typeof v.description!=='string'||v.description.length>240||typeof v.url!=='string'||v.url.length>1200)return bad();
  if(v.storagePath!==undefined||v.fileName!==undefined){
   if(v.kind!=='file'||!slug||!libraryPathValid(v.storagePath,slug,v.id)||v.url!==libraryDownloadPath(slug,v.id))return bad();
   try{libraryFileInput(v.fileName,1);}catch{return bad();}
   return{id:v.id,kind:v.kind,title:v.title.trim(),description:v.description.trim(),url:v.url,published:v.published,storagePath:v.storagePath,fileName:v.fileName};
  }
  let u:URL;try{u=new URL(v.url);}catch{return bad();}
  if(u.href.length>1200||u.protocol!=='https:'||u.username||u.password||u.port||u.hostname==='localhost'||/^[\d.]+$/.test(u.hostname)||u.hostname.includes(':')||u.hostname.endsWith('.local'))return bad();
  if(v.kind==='youtube'&&!youtubeVideoId(v.url))return bad();
  return{id:v.id,kind:v.kind,title:v.title.trim(),description:v.description.trim(),url:u.href,published:v.published};
 });
}
