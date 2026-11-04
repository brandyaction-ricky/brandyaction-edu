import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { completionGuideSettings, completionGuideSettingsKey, uuid } from '@/lib/purchase-onboarding';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const cohortColumns = 'id,name,course_id,courses!inner(title,category,list_price)';

function paidCohorts(db: ReturnType<typeof createAdminClient>, productId: string | null) {
  const query = db.from('cohorts').select(cohortColumns).neq('courses.category', 'free').gt('courses.list_price', 0);
  return productId ? query.eq('course_id', productId) : query;
}

async function operator() {
  const user = await getOperatorUser('products');
  return user?.permissions.orders ? user : null;
}

export async function GET(request: Request) {
  try {
    if (!await operator()) return reply({ error: '상품과 주문 관리 권한이 필요합니다.' }, 403);
    const params = new URL(request.url).searchParams;
    const cohortId = params.get('cohort');
    const productId = params.get('product');
    if (productId !== null && !uuid(productId)) return reply({ error: '상품을 확인해 주세요.' }, 400);
    if (cohortId !== null && !uuid(cohortId)) return reply({ error: '기수를 확인해 주세요.' }, 400);
    const db = createAdminClient();
    const query = paidCohorts(db, productId);
    if (!cohortId) {
      const cohorts = await query.order('created_at', { ascending: false }).order('id').limit(100);
      if (cohorts.error) throw cohorts.error;
      return reply({ cohorts: cohorts.data || [] });
    }

    const cohort = await query.eq('id', cohortId).maybeSingle();
    if (cohort.error) throw cohort.error;
    if (!cohort.data) return reply({ error: '이 상품에서 안내할 유료 클래스의 기수를 선택해 주세요.' }, 400);
    const row = await db.from('site_settings').select('value').eq('key', completionGuideSettingsKey(cohortId)).eq('is_public', false).maybeSingle();
    if (row.error) throw row.error;
    return reply({ settings: row.data ? completionGuideSettings(row.data.value) : null });
  } catch { return reply({ error: '결제 후 안내 설정을 불러오지 못했습니다.' }, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '요청 출처를 확인해 주세요.' }, 403);
    const user = await operator();
    if (!user) return reply({ error: '상품과 주문 관리 권한이 필요합니다.' }, 403);
    const raw = await request.text();
    if (raw.length > 4000) return reply({ error: '입력 내용이 너무 큽니다.' }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return reply({ error: '입력 형식을 확인해 주세요.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || !uuid(body.cohort)) return reply({ error: '기수를 확인해 주세요.' }, 400);
    const productId = body.product ?? null;
    if (productId !== null && !uuid(productId)) return reply({ error: '상품을 확인해 주세요.' }, 400);
    let settings;
    try { settings = completionGuideSettings(body.settings); }
    catch (error) { return reply({ error: error instanceof Error ? error.message : '안내 링크를 확인해 주세요.' }, 400); }

    const db = createAdminClient();
    const cohort = await paidCohorts(db, productId).eq('id', body.cohort).maybeSingle();
    if (cohort.error) throw cohort.error;
    if (!cohort.data) return reply({ error: '이 상품에서 안내할 유료 클래스의 기수를 선택해 주세요.' }, 400);
    const key = completionGuideSettingsKey(body.cohort);
    const saved = await db.from('site_settings').upsert({ key, value: settings, is_public: false, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (saved.error) throw saved.error;
    const audit = await db.from('audit_logs').insert({ actor_user_id: user.id, action: 'purchase_onboarding.settings_saved', entity_type: 'cohort', entity_id: body.cohort,
      after_data: { enabled: Boolean(settings.url), guideConfigured: Boolean(settings.url) } });
    if (audit.error) throw audit.error;
    return reply({ ok: true, settings });
  } catch { return reply({ error: '결제 후 안내 설정을 저장하지 못했습니다.' }, 503); }
}
