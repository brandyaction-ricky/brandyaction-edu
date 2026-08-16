import { createHmac, randomUUID } from "node:crypto";

export type SolapiMessage = { to: string; text: string; type: "SMS" | "LMS" | "ATA"; kakaoOptions?: { pfId: string; templateId: string; buttons?:Array<{buttonType:"WL";buttonName:string;linkMo:string;linkPc:string}> } };

export function solapiConfigured() {
  return Boolean(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SOLAPI_SENDER_PHONE);
}

function authorization() {
  const apiKey=process.env.SOLAPI_API_KEY||"";
  const apiSecret=process.env.SOLAPI_API_SECRET||"";
  if(!apiKey||!apiSecret)throw new Error("SOLAPI API 키·시크릿이 설정되지 않았습니다.");
  const date=new Date().toISOString();
  const salt=randomUUID();
  const signature=createHmac("sha256",apiSecret).update(date+salt).digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

export async function sendSolapiMessages(messages: SolapiMessage[]) {
  const from=(process.env.SOLAPI_SENDER_PHONE||"").replace(/\D/g,"");
  if(!from)throw new Error("SOLAPI 발신번호가 설정되지 않았습니다.");
  const response=await fetch("https://api.solapi.com/messages/v4/send-many/detail",{method:"POST",headers:{"Content-Type":"application/json",Authorization:authorization()},body:JSON.stringify({messages:messages.map(message=>({...message,from}))})});
  const body=await response.json().catch(()=>({})) as {groupInfo?:{groupId?:string};errorMessage?:string;message?:string};
  if(!response.ok)throw new Error(body.errorMessage||body.message||`SOLAPI 발송 실패 (${response.status})`);
  return {groupId:body.groupInfo?.groupId||""};
}

export type SolapiGroupStatus={total:number;success:number;failed:number;pending:number};
export async function getSolapiGroupStatus(groupId:string):Promise<SolapiGroupStatus>{
  const response=await fetch(`https://api.solapi.com/messages/v4/groups/${encodeURIComponent(groupId)}`,{headers:{Authorization:authorization()},cache:"no-store"});
  const body=await response.json().catch(()=>({})) as {count?:Record<string,number>;errorMessage?:string;message?:string};
  if(!response.ok)throw new Error(body.errorMessage||body.message||`SOLAPI 결과 조회 실패 (${response.status})`);
  const count=body.count||{};
  const total=Number(count.total||0);
  const success=Number(count.sentSuccess||0);
  const failed=Number(count.sentFailed||0)+Number(count.registeredFailed||0);
  const pending=Math.max(0,total-success-failed);
  return {total,success,failed,pending};
}
