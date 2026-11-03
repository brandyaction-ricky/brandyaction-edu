import {campusError} from '../snapshot';
export async function readSpaceJson(request:Request,limit=12000):Promise<Record<string,unknown>>{
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')||Number(request.headers.get('content-length'))>limit)campusError(400,'입력 내용을 확인해 주세요.');
 const reader=request.body?.getReader();if(!reader)campusError(400,'요청 내용을 확인해 주세요.');
 const parts:Uint8Array[]=[];let length=0;try{for(;;){const {done,value}=await reader!.read();if(done)break;length+=value.byteLength;if(length>limit){await reader!.cancel();campusError(400,'입력 내용을 줄여 주세요.');}parts.push(value);}}finally{reader!.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 let value;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{campusError(400,'요청 형식을 확인해 주세요.');}
 if(!value||typeof value!=='object'||Array.isArray(value))campusError(400,'요청 형식을 확인해 주세요.');return value;
}
