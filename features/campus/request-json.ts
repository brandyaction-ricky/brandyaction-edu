/** Read metadata JSON with a byte budget even when Content-Length is absent or false. */
export async function readCampusJson(request:Request,maxBytes:number):Promise<unknown>{
 const invalid=()=>Object.assign(new Error('Invalid bounded JSON request'),{status:400});
 const contentType=request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase();
 const length=request.headers.get('content-length');
 if(contentType!=='application/json'||(length!==null&&(!/^\d+$/.test(length)||Number(length)>maxBytes)))throw invalid();
 if(!request.body)throw invalid();
 const reader=request.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
 try{
  for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>maxBytes)throw invalid();text+=decoder.decode(next.value,{stream:true});}
  text+=decoder.decode();return JSON.parse(text);
 }catch{
  // Do not retain the remaining stream after an invalid encoding or oversized chunk.
  void reader.cancel().catch(()=>{});throw invalid();
 }finally{reader.releaseLock();}
}
