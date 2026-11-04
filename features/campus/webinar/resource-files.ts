/** Only files uploaded into the campus library namespace can be published here. */
export const LIBRARY_MAX_BYTES=20*1024*1024;
export const libraryMime:Record<string,string>={pdf:'application/pdf',zip:'application/zip',txt:'text/plain',csv:'text/csv',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',hwp:'application/x-hwp'};
export function libraryFileInput(name:unknown,size:unknown){
 if(typeof name!=='string'||!name.trim()||name.length>160||/[\\/\u0000-\u001f\u007f]/.test(name))throw Error('파일 이름을 확인해 주세요.');
 const extension=name.split('.').pop()?.toLowerCase()||'';
 if(!libraryMime[extension])throw Error('PDF, ZIP, TXT, CSV, DOCX, XLSX, PPTX, HWP 파일을 선택해 주세요.');
 if(typeof size!=='number'||!Number.isSafeInteger(size)||size<1||size>LIBRARY_MAX_BYTES)throw Error('20MB 이하의 파일을 선택해 주세요.');
 return {name:name.normalize('NFC'),extension,contentType:libraryMime[extension]};
}
export function libraryPathValid(path:unknown,slug:string,id:string){return typeof path==='string'&&path.startsWith(`edu/campus-library/${slug}/${id}/`)&&/^edu\/campus-library\/[a-z0-9][a-z0-9-]{2,59}\/[-\w]{1,60}\/[\da-f-]{36}\.(pdf|zip|txt|csv|docx|xlsx|pptx|hwp)$/.test(path);}
export function libraryDownloadPath(slug:string,id:string){return `/api/campus/webinar/${slug}/resources/${id}`;}
