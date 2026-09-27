import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { DEFAULT_ONBOARDING_ROOM_NAME, onboardingSettingsKey, purchaseOnboardingSettings, uuid } from '@/lib/purchase-onboarding';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const relatedCourse = (value: unknown): { title?: string; category?: string; list_price?: number } | null => {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === 'object' ? row as { title?: string; category?: string; list_price?: number } : null;
};
async function operator() {
  const user = await getOperatorUser('products');
  return user?.permissions.orders ? user : null;
}

export async function GET(request: Request) {
  try {
    if (!await operator()) return reply({ error: '상품과 주문 관리 권한이 필요합니다.' }, 403);
    const db = createAdminClient();
    const cohortId = new URL(request.url).searchParams.get('cohort');
    if (cohortId && !uuid(cohortId)) return reply({ error: '기수를 확인해 주세요.' }, 400);
    const cohorts = await db.from('cohorts').select('id,name,course_id,courses(title,category,list_price)').order('created_at', { ascending: false }).limit(100);
    if (cohorts.error) throw cohorts.error;
    const selected = (cohorts.data || []).find(row => row.id === cohortId);
    const moonshotFourth = selected && /문샷/.test(relatedCourse(selected.courses)?.title || '') && /4기/.test(selected.name || '');
    let settings = { roomName: moonshotFourth ? DEFAULT_ONBOARDING_ROOM_NAME : '', inviteUrl: '', paidImage: '', organicImage: '', enabled: false };
    if (cohortId) {
      const row = await db.from('site_settings').select('value').eq('key', onboardingSettingsKey(cohortId)).eq('is_public', false).maybeSingle();
      if (row.error) throw row.error;
      if (row.data) settings = purchaseOnboardingSettings(row.data.value);
    }
    return reply({ cohorts: (cohorts.data || []).filter(row => { const course = relatedCourse(row.courses); return course?.category !== 'free' && Number(course?.list_price || 0) > 0; }), settings });
  } catch { return reply({ error: '결제 후 안내 설정을 불러오지 못했습니다.' }, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '요청 출처를 확인해 주세요.' }, 403);
    const user = await operator();
    if (!user) return reply({ error: '상품과 주문 관리 권한이 필요합니다.' }, 403);
    const raw = await request.text();
    if (raw.length > 3000) return reply({ error: '입력 내용이 너무 큽니다.' }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return reply({ error: '입력 형식을 확인해 주세요.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || !uuid(body.cohort)) return reply({ error: '기수를 확인해 주세요.' }, 400);
    const settings = purchaseOnboardingSettings(body.settings);
    const db = createAdminClient();
    const cohort = await db.from('cohorts').select('id,courses(category,list_price)').eq('id', body.cohort).maybeSingle();
    if (cohort.error) throw cohort.error;
    const course = relatedCourse(cohort.data?.courses);
    if (!cohort.data || course?.category === 'free' || Number(course?.list_price || 0) <= 0) return reply({ error: '유료 클래스의 기수를 선택해 주세요.' }, 400);
    const key = onboardingSettingsKey(body.cohort);
    const saved = await db.from('site_settings').upsert({ key, value: settings, is_public: false, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (saved.error) throw saved.error;
    const audit = await db.from('audit_logs').insert({ actor_user_id: user.id, action: 'purchase_onboarding.settings_saved', entity_type: 'cohort', entity_id: body.cohort,
      after_data: { enabled: settings.enabled, inviteConfigured: Boolean(settings.inviteUrl), paidImageConfigured: Boolean(settings.paidImage), organicImageConfigured: Boolean(settings.organicImage) } });
    if (audit.error) throw audit.error;
    return reply({ ok: true, settings });
  } catch (error) {
    const status = error instanceof Error && /방 이름|텔레그램|프로필 이미지|안내를 켜려면/.test(error.message) ? 400 : 503;
    return reply({ error: status === 400 && error instanceof Error ? error.message : '결제 후 안내 설정을 저장하지 못했습니다.' }, status);
  }
}
