import { createHmac, randomUUID } from "node:crypto";

export type SolapiMessage = { to: string; text: string; type: "SMS" | "LMS" | "ATA"; kakaoOptions?: { pfId: string; templateId: string } };

export function solapiConfigured() {
  return Boolean(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SOLAPI_SENDER_PHONE);
}

export async function sendSolapiMessages(messages: SolapiMessage[]) {
  const apiKey=process.env.SOLAPI_API_KEY||"";
  const apiSecret=process.env.SOLAPI_API_SECRET||"";
  const from=(process.env.SOLAPI_SENDER_PHONE||"").replace(/\D/g,"");
  if(!apiKey||!apiSecret||!from)throw new Error("SOLAPI API 키·시크릿·발신번호가 설정되지 않았습니다.");
  const date=new Date().toISOString();
  const salt=randomUUID();
  const signature=createHmac("sha256",apiSecret).update(date+salt).digest("hex");
  const response=await fetch("https://api.solapi.com/messages/v4/send-many/detail",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`},body:JSON.stringify({messages:messages.map(message=>({...message,from}))})});
  const body=await response.json().catch(()=>({})) as {groupInfo?:{groupId?:string};errorMessage?:string;message?:string};
  if(!response.ok)throw new Error(body.errorMessage||body.message||`SOLAPI 발송 실패 (${response.status})`);
  return {groupId:body.groupInfo?.groupId||""};
}
