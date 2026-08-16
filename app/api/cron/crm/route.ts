import { NextResponse } from "next/server";
import { processDueCrmJobs } from "@/lib/crm-engine";

export const dynamic="force-dynamic";
export const maxDuration=60;

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET||"";
  if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized"},{status:401});
  try{return NextResponse.json({ok:true,...await processDueCrmJobs()})}
  catch(reason){return NextResponse.json({error:reason instanceof Error?reason.message:"CRM 자동화 실행 실패"},{status:500})}
}
