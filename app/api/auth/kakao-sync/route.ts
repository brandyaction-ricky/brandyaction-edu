import { getKakaoSyncConfig } from '@/lib/kakao-sync-server';
import { kakaoOAuthOptions } from '@/lib/kakao-sync';

export async function GET() {
  let options = {};
  try { options = kakaoOAuthOptions(await getKakaoSyncConfig()); } catch { /* Existing OAuth remains usable. */ }
  return Response.json({ options }, { headers: { 'Cache-Control': 'no-store' } });
}
