import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/server-auth";

export async function PUT(request:Request){
  const user=await getAuthenticatedUser();if(!user)return NextResponse.json({error:"로그인이 필요합니다."},{status:401});
  const body=await request.json().catch(()=>null) as {consent?:boolean}|null;if(typeof body?.consent!=="boolean")return NextResponse.json({error:"동의 여부를 확인해 주세요."},{status:400});
  const now=new Date().toISOString();const changes=body.consent?{marketing_consent:true,marketing_consent_at:now,marketing_opt_out_at:null}:{marketing_consent:false,marketing_opt_out_at:now};
  const {error}=await createAdminClient().from("profiles").update(changes).eq("id",user.id);if(error)return NextResponse.json({error:"마케팅 수신 동의를 저장하지 못했습니다."},{status:500});
  return NextResponse.json({ok:true});
}
