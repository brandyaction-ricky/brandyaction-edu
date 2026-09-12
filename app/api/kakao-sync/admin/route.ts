import { getAdminUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getKakaoSyncConfig } from '@/lib/kakao-sync-server';
import { validateKakaoSyncConfig } from '@/lib/kakao-sync';

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET() {
  if (!await getAdminUser()) return reply({ error: '최고 관리자만 카카오싱크 설정을 변경할 수 있습니다.' }, 403);
  try { return reply({ config: await getKakaoSyncConfig() }); }
  catch { return reply({ error: '설정을 불러오지 못했습니다. 다시 시도해 주세요.' }, 503); }
}
export async function PUT(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '요청 출처가 올바르지 않습니다.' }, 403);
  if (!await getAdminUser()) return reply({ error: '최고 관리자 권한이 필요합니다.' }, 403);
  let config;
  try {
    const raw = await request.text();
    if (raw.length > 10000) return reply({ error: '입력 내용이 너무 큽니다.' }, 413);
    config = validateKakaoSyncConfig(JSON.parse(raw));
  } catch (error) { return reply({ error: error instanceof Error ? error.message : '입력값을 확인해 주세요.' }, 400); }
  try {
    const { revision, ...value } = config;
    const { data, error } = await createAdminClient().from('kakao_sync_config')
      .update({ value, revision: revision + 1, updated_at: new Date().toISOString() })
      .eq('id', true).eq('revision', revision).select('revision').maybeSingle();
    if (error) return reply({ error: '설정을 저장하지 못했습니다.' }, 503);
    if (!data) return reply({ error: '다른 관리자가 수정했습니다. 새로고침 후 다시 저장해 주세요.' }, 409);
    return reply({ config: { ...value, revision: data.revision } });
  } catch { return reply({ error: '설정을 저장하지 못했습니다.' }, 503); }
}
