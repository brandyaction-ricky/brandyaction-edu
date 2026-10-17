import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getKakaoRequiredConsent } from '@/lib/kakao-sync-server';
export async function GET() {
  const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
  try {
    const {data,error}=await (await createClient()).auth.getUser();
    if(error || !data.user)return reply({error:'로그인이 필요해요.'},401);
    const receipt=await getKakaoRequiredConsent(data.user);
    return reply({requiredAccepted:!!receipt,agreedAt:receipt?.agreedAt ?? null});
  } catch { return reply({error:'필수 동의 확인을 다시 시도해 주세요.'},503); }
}
