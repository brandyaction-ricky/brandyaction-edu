import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { bannerTextLimits, sections, safeUrl, type Row } from '@/lib/platform';
import { containsFreeClassCampaign, hasLearningAccess, paidCourseReadinessIssues } from '@/lib/platform-rules';
import { getEduSettings } from '@/lib/edu-settings';
import { gradeQuiz, type QuizDefinition } from '@/lib/mission-quiz';
import { adminSelectColumns, adminTables, archiveValues, cohortStatus, phoneNumber, validImage, assetPath, imagePreviewUrl, databaseMessage, excludedMemberStatus } from '@/lib/qa-rules';
import { POLICY_VERSION } from '@/lib/legal-policies';
import { getOperatorUser, permissionsFor, sectionScopes } from '@/lib/operator-permissions';
import { crmDeliveryState } from '@/lib/crm-delivery';
import { mergeProductDigitalSections, mergeProductMetadata, mergeProductResources, productDigitalSections, productMetadataFields, productResources, productResourceScopes } from '@/lib/product-metadata';
const reply = (data: unknown, status = 200) =>
    Response.json(data, {
        status,
        headers: { 'Cache-Control': 'private, no-store' },
    });
const uid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function fail(message: string, status = 400): never {
    throw Object.assign(new Error(message), { status });
}
export async function GET(request: Request) {
    const started = performance.now();
    try {
        const user = await getAuthenticatedUser();
        const authenticated = performance.now();
        const params = new URL(request.url).searchParams;
        const adminMode = params.get('admin') === '1';
        const sectionKey = params.get('section') || 'home';
        const record = params.get('record');
        if (record && (!uid(record) || !['products', 'learning'].includes(sectionKey))) return reply({ error: '편집할 항목을 확인해 주세요.' }, 400);
        const productEditorRead = adminMode && sectionKey === 'products' && Boolean(record);
        const page = Math.max(1, Math.min(100000, Number(params.get('page')) || 1));
        const pageSize = sectionKey === 'orders' ? 30 : 100;
        if (adminMode && !user) return reply({ error: '로그인이 필요합니다.', user: null }, 401);
        const operator = adminMode ? await getOperatorUser(sectionScopes[sectionKey], user) : null;
        const authorized = performance.now();
        if (adminMode && (!operator || (sectionKey === 'staff' && operator.role !== 'admin'))) return reply({ error: '이 화면에 접근할 운영 권한이 필요합니다.', user }, 403);
        const db = adminMode ? createAdminClient() : await createClient();
        if (adminMode && !Object.hasOwn(adminTables, sectionKey)) return reply({ error: '조회 화면을 확인해 주세요.' }, 400);
        const settings = getEduSettings();
        let tables = productEditorRead ? ['courses', 'cohorts'] : adminMode ? adminTables[sectionKey] : ['courses', 'cohorts', 'curriculum_weeks', 'curriculum_lessons', 'articles', 'article_categories', 'review_videos', 'site_banners', 'reviews', 'cohort_sessions'];
        if (adminMode && sectionKey === 'home' && operator?.role === 'staff') tables = tables.filter((table) => (['courses', 'cohorts'].includes(table) && operator.permissions.products) || (['mission_submissions', 'edu_questions'].includes(table) && operator.permissions.members));
        const data: Record<string, Row[]> = {};
        let pagination: { page: number; pageSize: number; total: number } | null = null;
        const primaryTable = sections.find((section) => section.key === sectionKey)?.table;
        const missionCourse = params.get('course') || '';
        const missionWeek = params.get('week') || '';
        const missionState = params.get('missionState') || 'active';
        if (adminMode && sectionKey === 'missions' && ((missionCourse && !uid(missionCourse)) || (missionWeek && !uid(missionWeek)) || !['active', 'published', 'hidden', 'archived'].includes(missionState))) return reply({ error: '미션 조회 조건을 확인해 주세요.' }, 400);
        const missionQuery = (state: string, head = false) => {
            // Use server-side scope BEFORE pagination; counts and rows use the same joins.
            const scoped = Boolean(missionCourse || missionWeek);
            let query = db.from('curriculum_missions').select(scoped ? '*,curriculum_lessons!inner(week_id,curriculum_weeks!inner(course_id))' : '*', { count: 'exact', head });
            if (missionCourse) query = query.eq('curriculum_lessons.curriculum_weeks.course_id', missionCourse);
            if (missionWeek) query = query.eq('curriculum_lessons.week_id', missionWeek);
            query = state === 'archived' ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
            if (state === 'published' || state === 'hidden') query = query.eq('is_published', state === 'published');
            return query;
        };
        const deferredOrderTables = adminMode && sectionKey === 'orders' ? new Set(['order_items', 'payments', 'enrollments', 'edu_refund_requests']) : new Set<string>();
        await Promise.all([
            (async () => {
                if (!adminMode) return;
                if (sectionKey === 'home') {
                    const summary = await db.rpc('edu_admin_summary');
                    if (summary.error) throw summary.error;
                    const row = summary.data as Row;
                    if (operator?.role === 'admin' || operator?.permissions.members) {
                        const members = await db.from('profiles').select('id', { count: 'exact', head: true }).neq('status', excludedMemberStatus);
                        if (members.error) throw members.error;
                        row.members = members.count || 0;
                    }
                    data.admin_summary = [operator?.role === 'staff' ? {
                        id: 'staff-summary',
                        members: operator.permissions.members ? row.members : 0,
                        activeEnrollments: operator.permissions.members || operator.permissions.products ? row.activeEnrollments : 0,
                        pendingReviews: operator.permissions.members ? row.pendingReviews : 0,
                        openQuestions: operator.permissions.members ? row.openQuestions : 0,
                        netRevenue: operator.permissions.orders ? row.netRevenue : 0,
                    } : row];
                } else if (operator?.role === 'admin' || operator?.permissions.members) {
                    // The sidebar needs only this badge, not full revenue/member aggregates.
                    const pending = await db.from('mission_submissions').select('id', { count: 'exact', head: true }).eq('status', 'submitted');
                    if (pending.error) throw pending.error;
                    data.admin_summary = [{ id: 'navigation-summary', pendingReviews: pending.count || 0 }];
                }
            })(),
            ...tables.filter((table) => !deferredOrderTables.has(table)).map(async (table) => {
                if (adminMode && sectionKey === 'missions' && table === 'curriculum_missions') {
                    const [result, published, hidden, archived] = await Promise.all([
                        missionQuery(missionState).order('created_at', { ascending: false }).order('id').range((page - 1) * pageSize, page * pageSize - 1),
                        missionQuery('published', true), missionQuery('hidden', true), missionQuery('archived', true),
                    ]);
                    for (const item of [result, published, hidden, archived]) if (item.error) throw item.error;
                    data.curriculum_missions = (result.data || []) as unknown as Row[];
                    data.mission_summary = [{ id: 'mission-summary', active: (published.count || 0) + (hidden.count || 0), published: published.count || 0, hidden: hidden.count || 0, archived: archived.count || 0 }];
                    pagination = { page, pageSize, total: result.count || 0 };
                    return;
                }
                const columns = adminMode
                    ? table === 'crm_tags' && sectionKey === 'tags'
                        ? '*,crm_member_tags(count)'
                        : table === 'payments'
                            ? 'id,order_id,method,status,approved_amount,cancelled_amount,receipt_url,approved_at,created_at'
                            : table === 'edu_refund_requests'
                                ? 'id,payment_id,amount,reason,status,created_at'
                                : adminSelectColumns(sectionKey, table)
                    : table === 'reviews'
                        ? 'id,course_id,author_name,author_nickname,rating,body,is_featured,display_order,published_at,created_at'
                        : '*';
                const serverPaged = adminMode && !productEditorRead && table === primaryTable && !['home', 'members', 'reviews', 'analytics', 'metrics', 'seo', 'settings', 'staff', 'templates', 'campaigns', 'automations'].includes(sectionKey);
                let query = db.from(table).select(columns, serverPaged ? { count: 'exact' } : undefined);
                if (record && adminMode && table === primaryTable) query = query.eq('id', record);
                if (record && productEditorRead && table === 'cohorts') query = query.eq('course_id', record);
                query = serverPaged ? query.range((page - 1) * pageSize, page * pageSize - 1) : query.limit(productEditorRead && table === 'courses' ? 1 : 1000);
                if (adminMode && sectionKey === 'customers' && table === 'profiles') query = query.neq('status', excludedMemberStatus);
                if (table === 'edu_questions' && !adminMode) query = query.eq('is_archived', false);
                if (table === 'site_settings' && adminMode && operator?.role !== 'admin') query = query.not('key', 'like', 'edu_staff_permissions_%');
                if (['courses', 'review_videos', 'site_banners', 'curriculum_lessons', 'reviews'].includes(table)) {
                    query = query.order('display_order');
                    if (table === 'site_banners') query = query.order('created_at');
                }
                else if (table === 'curriculum_weeks') query = query.order('week_number');
                else if (table === 'lesson_progress') query = query.order('updated_at', { ascending: false });
                else if (!['site_settings', 'lesson_contents', 'mission_quizzes', 'cohort_session_contents', 'crm_member_tags', 'coupon_products'].includes(table)) query = query.order('created_at', { ascending: false });
                if (!adminMode) {
                    if (['courses', 'articles', 'reviews'].includes(table)) query = query.eq('status', 'published');
                    if (['review_videos', 'curriculum_weeks', 'curriculum_lessons'].includes(table)) query = query.eq('is_published', true);
                    if (table === 'cohort_sessions') query = query.eq('is_public', true);
                    if (table === 'site_banners') query = query.eq('is_active', true);
                }
                const r = await query;
                if (r.error) throw r.error;
                data[table] = (r.data || []) as unknown as Row[];
                if (serverPaged) pagination = { page, pageSize, total: r.count || 0 };
            }),
            ...(productEditorRead && record ? [(async () => {
                const configs = await db.from('landing_configs').select('id,kakao_url,cta_label,pixel_enabled,pixel_id').eq('id', record).limit(1);
                if (configs.error) throw configs.error;
                data.landing_configs = (configs.data || []) as Row[];
            })()] : []),
        ]);
        for (const banner of data.site_banners || []) {
            banner.image_url = imagePreviewUrl(String(banner.image_path || ''), process.env.NEXT_PUBLIC_SUPABASE_URL || '');
        }
        if (adminMode && sectionKey === 'customers') {
            const memberCount = () => db.from('profiles').select('id', { count: 'exact', head: true }).neq('status', excludedMemberStatus);
            const [active, suspended, marketing] = await Promise.all([memberCount().eq('status', 'active'), memberCount().eq('status', 'suspended'), memberCount().eq('marketing_consent', true)]);
            for (const item of [active, suspended, marketing]) if (item.error) throw item.error;
            data.member_summary = [{ id: 'member-summary', active: active.count || 0, suspended: suspended.count || 0, marketing: marketing.count || 0 }];
        }
        if (adminMode && sectionKey === 'products' && !productEditorRead) {
            const [allProducts, publishedProducts, draftProducts, archivedProducts, configs] = await Promise.all([
                db.from('courses').select('id', { count: 'exact' }).is('archived_at', null).limit(1000),
                db.from('courses').select('id', { count: 'exact', head: true }).is('archived_at', null).eq('status', 'published'),
                db.from('courses').select('id', { count: 'exact', head: true }).is('archived_at', null).eq('status', 'draft'),
                db.from('courses').select('id', { count: 'exact', head: true }).not('archived_at', 'is', null),
                data.courses?.length
                    ? db.from('landing_configs').select('id,kakao_url,cta_label,pixel_enabled,pixel_id').in('id', data.courses.map(course => course.id))
                    : Promise.resolve({ data: [], error: null }),
            ]);
            if (allProducts.error) throw allProducts.error;
            if (publishedProducts.error) throw publishedProducts.error;
            if (draftProducts.error) throw draftProducts.error;
            if (archivedProducts.error) throw archivedProducts.error;
            if (configs.error) throw configs.error;
            data.landing_configs = (configs.data || []) as Row[];
            const activeProductIds = new Set((allProducts.data || []).map(product => String(product.id)));
            const upcomingProductIds = new Set(
                (data.cohorts || [])
                    .filter(cohort => activeProductIds.has(String(cohort.course_id)) && cohortStatus(cohort) === 'upcoming')
                    .map(cohort => String(cohort.course_id)),
            );
            data.product_summary = [{
                id: 'product-summary',
                total: allProducts.count || 0,
                published: publishedProducts.count || 0,
                upcoming: upcomingProductIds.size,
                draft: draftProducts.count || 0,
                archived: archivedProducts.count || 0,
            }];
        }
        if (adminMode && sectionKey === 'orders') {
            const orderIds = (data.orders || []).map((row) => row.id).filter(Boolean);
            data.order_items = [];
            data.payments = [];
            data.enrollments = [];
            data.edu_refund_requests = [];
            if (orderIds.length) {
                const [items, payments] = await Promise.all([
                    db.from('order_items').select(adminSelectColumns(sectionKey, 'order_items')).in('order_id', orderIds),
                    db.from('payments').select('id,order_id,method,status,approved_amount,cancelled_amount,receipt_url,approved_at,created_at').in('order_id', orderIds),
                ]);
                if (items.error) throw items.error;
                if (payments.error) throw payments.error;
                data.order_items = (items.data || []) as unknown as Row[];
                data.payments = (payments.data || []) as Row[];
                const itemIds = data.order_items.map((row) => row.id).filter(Boolean);
                const paymentIds = data.payments.map((row) => row.id).filter(Boolean);
                const [enrollments, refunds] = await Promise.all([
                    itemIds.length ? db.from('enrollments').select(adminSelectColumns(sectionKey, 'enrollments')).in('order_item_id', itemIds) : Promise.resolve({ data: [], error: null }),
                    paymentIds.length ? db.from('edu_refund_requests').select('id,payment_id,amount,reason,status,created_at').in('payment_id', paymentIds) : Promise.resolve({ data: [], error: null }),
                ]);
                if (enrollments.error) throw enrollments.error;
                if (refunds.error) throw refunds.error;
                data.enrollments = (enrollments.data || []) as unknown as Row[];
                data.edu_refund_requests = (refunds.data || []) as Row[];
            }
        }
        if (user && !adminMode) {
            await Promise.all(['enrollments', 'orders', 'edu_questions', 'customer_coupons', 'edu_mission_drafts'].map(async (table) => {
                const columns = table === 'customer_coupons' ? '*,coupon:coupons(name,code,discount_type,discount_value,ends_at)' : '*';
                let query = db.from(table).select(columns).eq('user_id', user.id).limit(1000);
                if (table === 'edu_questions') query = query.eq('is_archived', false);
                const r = await query;
                if (r.error) throw r.error;
                data[table] = r.data as unknown as Row[];
            }));
            const orderIds = (data.orders || []).map((o) => o.id);
            if (orderIds.length) {
                await Promise.all(['order_items', 'payments'].map(async (table) => {
                    const result = await db
                        .from(table)
                        .select(table === 'payments' ? 'id,order_id,method,status,approved_amount,cancelled_amount,receipt_url,approved_at' : 'id,order_id,course_id,cohort_id,item_name,unit_price')
                        .in('order_id', orderIds);
                    if (result.error) throw result.error;
                    data[table] = result.data as unknown as Row[];
                }));
            }
            const cohortIds = (data.enrollments || []).filter((e) => hasLearningAccess(e)).map((e) => e.cohort_id);
            const sessionIds = (data.cohort_sessions || []).filter((s) => cohortIds.includes(s.cohort_id)).map((s) => s.id);
            if (sessionIds.length) {
                const r = await db.from('cohort_session_contents').select('session_id,live_url,replay_url').in('session_id', sessionIds);
                if (r.error) throw r.error;
                data.cohort_session_contents = r.data as unknown as Row[];
            }
            const ids = (data.enrollments || []).filter((e) => hasLearningAccess(e)).map((e) => e.id);
            if (ids.length) {
                await Promise.all(['lesson_progress', 'mission_submissions'].map(async (table) => {
                    const r = await db.from(table).select('*').in('enrollment_id', ids);
                    if (r.error) throw r.error;
                    data[table] = r.data as Row[];
                }));
            }
            await Promise.all(['curriculum_missions', 'lesson_contents'].map(async (table) => {
                const lessons = (data.curriculum_lessons || []).filter((l) => (data.curriculum_weeks || []).some((w) => w.id === l.week_id)).map((l) => l.id);
                if (!lessons.length) {
                    data[table] = [];
                    return;
                }
                let query = db.from(table).select('*').in('lesson_id', lessons).limit(1000);
                if (table === 'curriculum_missions') query = query.eq('is_published', true);
                const r = await query;
                if (r.error) throw r.error;
                data[table] = r.data as Row[];
            }));
            const r = await db.from('reviews').select('*').eq('user_id', user.id);
            if (r.error) throw r.error;
            data.my_reviews = r.data as Row[];
        }
        if (!adminMode) {
            const now = Date.now();
            data.site_banners = (data.site_banners || []).filter((b) => (!b.starts_at || Date.parse(String(b.starts_at)) <= now) && (!b.ends_at || Date.parse(String(b.ends_at)) > now));
            const landingDb = createAdminClient();
            const freeCourseIds = (data.courses || []).filter(c => Number(c.list_price) === 0).map(c => c.id);
            const landingResult = freeCourseIds.length ? await landingDb.from('landing_configs').select('*').in('id', freeCourseIds) : { data: [], error: null };
            if (!landingResult.error && landingResult.data?.length) {
                const snapshots = await landingDb.from('section_snapshots').select('landing_id,layout_ver,content').or(landingResult.data.map(c => `and(landing_id.eq.${c.id},layout_ver.eq.${c.layout_ver})`).join(','));
                data.landing_configs = landingResult.data.map(c => {
                    const snapshot = snapshots.data?.find(s => s.landing_id === c.id && s.layout_ver === c.layout_ver);
                    const frozen = snapshot?.content?.course || {};
                    const metadata = { ...frozen.metadata };
                    for (const key of ['detailImageUrl', 'detail_image_url', 'thumbnailUrl', 'thumbnail_url']) {
                        const value = metadata[key];
                        if (typeof value === 'string' && value && !/^https?:\/\//.test(value) && !value.startsWith('/')) metadata[key] = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/course-assets/' + value;
                    }
                    if (Array.isArray(metadata.detail_images)) metadata.detail_images = metadata.detail_images.map((entry: unknown) => {
                        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
                        const image = { ...(entry as Record<string, unknown>) }, value = image.path;
                        if (typeof value === 'string' && value && !/^https?:\/\//.test(value) && !value.startsWith('/')) image.path = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/course-assets/' + value;
                        return image;
                    });
                    if (Array.isArray(metadata.digital_content_sections)) metadata.digital_content_sections = productDigitalSections(metadata).map(section => ({ ...section, items: section.items.map(item => ({ ...item, videoUrl: '' })) }));
                    return { ...c, course_snapshot: { ...frozen, metadata } };
                });
            }
            const bannerResult = await createAdminClient().from('site_settings').select('key,value').eq('key', 'edu_article_banner').limit(1);
            const bannerSetting = Array.isArray(bannerResult.data) ? bannerResult.data[0] : bannerResult.data;
            if (!bannerResult.error) {
                const value = bannerSetting ? bannerSetting.value as Record<string, unknown> : {
                    enabled: true,
                    eyebrow: 'FREE CLASS · 사업자 무료 3강',
                    title: '사업자를 위한 마케팅·AI 매출 진단',
                    description: '광고비를 더 쓰기 전에 고객 유입, 콘텐츠, 전환, 재구매 중 어디에서 매출이 막히는지 먼저 확인합니다.',
                    signupNotice: '무료 회원가입을 완료하면 사업자용 3강 전체를 바로 볼 수 있습니다. 별도 결제는 필요 없습니다.',
                    signupCTA: '무료 회원가입하고 3강 보기',
                    memberCTA: '아티클 읽으러 가기',
                    videos: [
                        { title: '매출을 막는 마케팅 병목 찾기', url: '' },
                        { title: 'AI로 줄일 일과 사람이 결정할 일', url: '' },
                        { title: '7일 안에 실행할 매출 실험 설계', url: '' },
                    ],
                };
                const videos = Array.isArray(value?.videos) ? value.videos.slice(0, 3).map((item) => {
                    const video = item as Record<string, unknown>;
                    const url = safeUrl(video.url);
                    return { title: String(video.title || '').slice(0, 120), available: Boolean(url), url: user ? url : '' };
                }) : [];
                data.article_banner = [{ id: 'edu_article_banner', key: 'edu_article_banner', value: { enabled: value?.enabled !== false, eyebrow: String(value?.eyebrow || '').slice(0, 80), title: String(value?.title || '').slice(0, 120), description: String(value?.description || '').slice(0, 240), signupNotice: String(value?.signupNotice || '').slice(0, 220), signupCTA: String(value?.signupCTA || '').slice(0, 45), memberCTA: String(value?.memberCTA || '').slice(0, 45), videos } }];
            }
        }
        if (adminMode) {
            if (['templates', 'campaigns', 'automations'].includes(sectionKey)) data.crm_delivery_state = [crmDeliveryState() as unknown as Row];
        }
        const { operations } = await settings;
        if (adminMode && data.site_settings) {
            const setting = data.site_settings.find((r) => r.key === 'edu_operations');
            if (setting) setting.value = operations;
            else
                data.site_settings.push({
                    id: 'edu_operations',
                    key: 'edu_operations',
                    value: operations,
                });
        }
        if (!adminMode)
            for (const course of data.courses || []) {
                const metadata = course.metadata as Record<string, unknown> | null;
                if (metadata) {
                    for (const key of ['thumbnailUrl', 'thumbnail_url', 'detailImageUrl', 'detail_image_url']) {
                        const value = metadata[key];
                        if (typeof value === 'string' && value && !/^https?:\/\//.test(value) && !value.startsWith('/')) metadata[key] = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/course-assets/' + value;
                    }
                    if (Array.isArray(metadata.detail_images)) metadata.detail_images = metadata.detail_images.map((entry: unknown) => {
                        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
                        const image = { ...(entry as Record<string, unknown>) }, value = image.path;
                        if (typeof value === 'string' && value && !/^https?:\/\//.test(value) && !value.startsWith('/')) image.path = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/course-assets/' + value;
                        return image;
                    });
                    if (Array.isArray(metadata.product_resources)) metadata.product_resources = productResources(metadata).map(resource => ({ id: resource.id, name: resource.name, scope: resource.scope }));
                    if (Array.isArray(metadata.digital_content_sections)) metadata.digital_content_sections = productDigitalSections(metadata).map(section => ({ ...section, items: section.items.map(item => ({ ...item, videoUrl: '' })) }));
                }
            }
        if (!adminMode)
            for (const article of data.articles || []) {
                const value = article.cover_image_path;
                if (typeof value === 'string' && value && !/^https?:\/\//.test(value) && !value.startsWith('/')) article.cover_image_url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/course-assets/' + value;
            }
        const response = reply({
            user: adminMode ? operator : user,
            data,
            pagination,
            support: {
                email: typeof operations.supportEmail === 'string' ? operations.supportEmail : '',
                url: typeof operations.supportUrl === 'string' ? operations.supportUrl : '',
            },
        });
        response.headers.set('Server-Timing', `auth;dur=${(authenticated - started).toFixed(1)},permissions;dur=${(authorized - authenticated).toFixed(1)},data;dur=${(performance.now() - authorized).toFixed(1)},total;dur=${(performance.now() - started).toFixed(1)}`);
        return response;
    } catch (error) {
        console.error('platform read', error);
        return reply({ error: '데이터를 불러오지 못했습니다. 다시 시도해 주세요.' }, 503);
    }
}
export async function POST(request: Request) {
    try {
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
        const user = await getAuthenticatedUser();
        if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
        const body = (await request.json()) as Record<string, unknown>;
        const action = String(body.action || '');
        const db = createAdminClient();
        if (action === 'delete-member') {
            if (user.role !== 'admin') return reply({ error: '관리자만 회원을 삭제할 수 있습니다.' }, 403);
            if (!uid(body.id)) fail('삭제할 회원을 확인해 주세요.');
            if (body.id === user.id) fail('현재 로그인한 관리자 계정은 삭제할 수 없습니다.');
            const result = await db.rpc('edu_delete_member', { p_actor: user.id, p_member: body.id });
            if (result.error) {
                if (result.error.code !== 'P0001') console.error('member delete', result.error.code);
                fail(result.error.message || '회원을 삭제하지 못했습니다.', 409);
            }
            return reply({ ok: true, result: result.data });
        }
        if (action === 'save-product-resource' || action === 'delete-product-resource') {
            const permissions = await permissionsFor(user);
            if (!permissions.products) return reply({ error: '상품 관리 권한이 필요합니다.' }, 403);
            const courseId = String(body.courseId || '');
            if (!uid(courseId)) fail('상품을 먼저 저장한 뒤 자료를 등록해 주세요.');
            const current = await db.from('courses').select('metadata').eq('id', courseId).single();
            if (current.error || !current.data) fail('상품 정보를 불러오지 못했습니다.', 404);
            const resources = productResources((current.data.metadata || {}) as Record<string, unknown>);
            const resourceId = String(body.resourceId || '');
            if (action === 'delete-product-resource') {
                if (!uid(resourceId) || !resources.some(item => item.id === resourceId)) fail('삭제할 자료를 확인해 주세요.');
                const result = await db.from('courses').update({ metadata: mergeProductResources(current.data.metadata, resources.filter(item => item.id !== resourceId)) }).eq('id', courseId);
                if (result.error) throw result.error;
                return reply({ ok: true });
            }
            const name = String(body.resourceName || '').trim();
            const path = String(body.storagePath || '').trim();
            const scope = String(body.accessScope || 'public');
            if (!name || name.length > 240) fail('자료 이름을 240자 이하로 입력해 주세요.');
            if (!/^edu\/[a-z0-9-]+\.[a-z0-9]{1,12}$/i.test(path) || path.includes('..')) fail('업로드할 파일을 선택해 주세요.');
            if (!productResourceScopes.includes(scope as (typeof productResourceScopes)[number])) fail('다운로드 권한을 확인해 주세요.');
            const id = uid(resourceId) ? resourceId : crypto.randomUUID();
            const item = { id, name, path, scope: scope as (typeof productResourceScopes)[number] };
            const next = resources.some(resource => resource.id === id) ? resources.map(resource => resource.id === id ? item : resource) : [...resources, item];
            const result = await db.from('courses').update({ metadata: mergeProductResources(current.data.metadata, next) }).eq('id', courseId);
            if (result.error) throw result.error;
            return reply({ ok: true, resource: item });
        }
        if (action === 'save-digital-content') {
            const permissions = await permissionsFor(user);
            if (!permissions.products) return reply({ error: '상품 관리 권한이 필요합니다.' }, 403);
            const courseId = String(body.courseId || '');
            if (!uid(courseId) || !Array.isArray(body.sections)) fail('디지털 상품과 콘텐츠 구성을 확인해 주세요.');
            const current = await db.from('courses').select('category,metadata').eq('id', courseId).single();
            if (current.error || !current.data) fail('상품 정보를 불러오지 못했습니다.', 404);
            if (current.data.category !== 'digital') fail('디지털 상품에서만 콘텐츠 구성을 저장할 수 있습니다.');
            let metadata;
            try { metadata = mergeProductDigitalSections(current.data.metadata, body.sections as never); }
            catch (error) { fail((error as Error).message); }
            const resourceIds = new Set(productResources(metadata).map(item => item.id));
            if (productDigitalSections(metadata).some(section => section.items.some(item => item.type === 'file' && !resourceIds.has(item.resourceId)))) fail('연결된 파일 정보를 다시 확인해 주세요.');
            const result = await db.from('courses').update({ metadata }).eq('id', courseId).select('metadata').single();
            if (result.error) throw result.error;
            return reply({ ok: true, sections: productDigitalSections((result.data.metadata || {}) as Record<string, unknown>) });
        }
        if (action === 'article-banner') {
            const permissions = await permissionsFor(user);
            if (!permissions.content) return reply({ error: '콘텐츠 관리 권한이 필요합니다.' }, 403);
            const value = body.value as Record<string, unknown>;
            const title = String(value?.title || '').trim();
            const videos = Array.isArray(value?.videos) ? value.videos.slice(0, 3).map((item) => {
                const video = item as Record<string, unknown>;
                const url = String(video.url || '').trim();
                if (url) {
                    let allowed = false;
                    try {
                        const parsed = new URL(url);
                        allowed = parsed.protocol === 'https:' && (parsed.hostname === 'youtu.be' || parsed.hostname === 'youtube.com' || parsed.hostname.endsWith('.youtube.com'));
                    } catch {}
                    if (!allowed) fail('무료 영상은 YouTube https 주소를 입력해 주세요.');
                }
                return { title: String(video.title || '').trim().slice(0, 120), url };
            }) : [];
            if (!title || title.length > 120) fail('배너 제목을 확인해 주세요.');
            const result = await db.from('site_settings').upsert({ key: 'edu_article_banner', value: { enabled: value?.enabled !== false, eyebrow: String(value?.eyebrow || '').trim().slice(0, 80), title, description: String(value?.description || '').trim().slice(0, 240), signupNotice: String(value?.signupNotice || '').trim().slice(0, 220), signupCTA: String(value?.signupCTA || '').trim().slice(0, 45), memberCTA: String(value?.memberCTA || '').trim().slice(0, 45), videos }, is_public: false }, { onConflict: 'key' });
            if (result.error) throw result.error;
            return reply({ ok: true });
        }
        if (action === 'article-category-save' || action === 'article-category-delete') {
            const permissions = await permissionsFor(user);
            if (!permissions.content) return reply({ error: '콘텐츠 관리 권한이 필요합니다.' }, 403);
            const id = String(body.id || '');
            if (action === 'article-category-delete') {
                if (!uid(id)) fail('삭제할 카테고리를 확인해 주세요.');
                const used = await db.from('articles').select('id', { count: 'exact', head: true }).eq('category_id', id);
                if (used.error) throw used.error;
                if (used.count) fail('사용 중인 카테고리는 삭제할 수 없습니다. 아티클 카테고리를 먼저 변경해 주세요.', 409);
                const removed = await db.from('article_categories').delete().eq('id', id);
                if (removed.error) throw removed.error;
                return reply({ ok: true });
            }
            if (id && !uid(id)) fail('수정할 카테고리를 확인해 주세요.');
            const name = String(body.name || '').trim();
            const slug = String(body.slug || '').trim().toLowerCase();
            const description = String(body.description || '').trim();
            const displayOrder = Number(body.displayOrder || 0);
            if (!name || name.length > 50) fail('카테고리명은 1~50자로 입력해 주세요.');
            if (!/^[a-z0-9-]{1,80}$/.test(slug)) fail('주소 이름은 영문 소문자·숫자·하이픈으로 입력해 주세요.');
            if (description.length > 160 || !Number.isSafeInteger(displayOrder) || displayOrder < 0 || displayOrder > 999) fail('카테고리 설명과 노출 순서를 확인해 주세요.');
            const values = { name, slug, description: description || null, display_order: displayOrder, is_active: body.active !== false };
            const result = id ? await db.from('article_categories').update(values).eq('id', id) : await db.from('article_categories').insert(values);
            if (result.error) fail(databaseMessage(result.error.code), result.error.code === '23505' ? 409 : 400);
            return reply({ ok: true });
        }
        if (action === 'archive') {
            const section = sections.find((s) => s.key === body.section);
            const permissions = await permissionsFor(user);
            if (!section || !permissions[sectionScopes[section.key]]) return reply({ error: '이 작업에 필요한 운영 권한이 없습니다.' }, 403);
            const ids = body.ids;
            if (!section || !archiveValues[section.key] || !Array.isArray(ids) || !ids.length || ids.length > 50 || !ids.every(uid)) fail('보관할 항목을 최대 50개까지 선택해 주세요.');
            const result = await db.rpc('edu_archive_records', {
                p_actor: user.id,
                p_section: section.key,
                p_ids: [...new Set(ids)],
            });
            if (result.error) throw result.error;
            return reply({ ok: true, result: result.data });
        }
        if (action === 'restore-products') {
            const permissions = await permissionsFor(user);
            const ids = body.ids;
            if (!permissions.products) return reply({ error: '상품 관리 권한이 필요합니다.' }, 403);
            if (!Array.isArray(ids) || !ids.length || ids.length > 50 || !ids.every(uid)) fail('복원할 상품을 최대 50개까지 선택해 주세요.');
            const result = await db.rpc('edu_restore_products', {
                p_actor: user.id,
                p_ids: [...new Set(ids)],
            });
            if (result.error) {
                if (result.error.code !== 'P0001') console.error('product restore', result.error.code);
                fail(result.error.message || '상품을 복원하지 못했습니다.', 409);
            }
            if (!Number(result.data)) fail('이미 복원됐거나 삭제 상태가 아닌 상품입니다.', 409);
            return reply({ ok: true, result: result.data });
        }
        if (action === 'save') {
            const section = sections.find((s) => s.key === body.section);
            const permissions = await permissionsFor(user);
            if (!section || !permissions[sectionScopes[section.key]]) return reply({ error: '이 작업에 필요한 운영 권한이 없습니다.' }, 403);
            if (!section || section.readOnly) fail('수정할 수 없는 항목입니다.');
            const input = (body.values || {}) as Record<string, unknown>;
            const values: Record<string, unknown> = {};
            const couponCourseId = section.table === 'coupons' ? String(input.applicable_course_id || '') : '';
            const productSchedule = section.table === 'courses' && ('recruitmentStartAt' in body || 'recruitmentEndAt' in body) ? {
                start: body.recruitmentStartAt === null ? null : String(body.recruitmentStartAt || ''),
                end: body.recruitmentEndAt === null ? null : String(body.recruitmentEndAt || ''),
            } : null;
            if (productSchedule) {
                if ((productSchedule.start && !Number.isFinite(Date.parse(productSchedule.start))) || (productSchedule.end && !Number.isFinite(Date.parse(productSchedule.end)))) fail('모집 일정을 확인해 주세요.');
                if (productSchedule.start && productSchedule.end && Date.parse(productSchedule.start) >= Date.parse(productSchedule.end)) fail('모집 마감은 모집 시작 이후로 설정해 주세요.');
                if (body.cohortId && !uid(body.cohortId)) fail('연결 기수를 확인해 주세요.');
            }
            if (section.table === 'courses' && !body.id) {
                // Removed publishing controls are generated only for new products.
                // Retrying the same creation intent must keep the same RPC fingerprint.
                if (!uid(body.requestId)) fail('새 등록 요청을 다시 열고 저장해 주세요.');
                const suffix = body.requestId;
                if (!input.slug) input.slug = 'product-' + suffix;
                if (!input.course_code) input.course_code = 'PRD-' + suffix;
            }
            if (body.id && archiveValues[section.key]) values.archived_at = null;
            for (const field of section.fields) {
                if (field.key in input) {
                    const value = input[field.key];
                    if (field.required && (value === null || value === '')) fail(`${field.label}을 입력해 주세요.`);
                    if (field.type === 'number' && value !== null && (!Number.isFinite(Number(value)) || Number(value) < 0)) fail('숫자를 확인해 주세요.');
                    if (field.type === 'checkbox' && typeof value !== 'boolean') fail('선택 항목을 확인해 주세요.');
                    if (field.type === 'url' && value && !safeUrl(value)) fail(`${field.label} 주소를 확인해 주세요.`);
                    if (field.type === 'image' && value && !validImage(value)) fail(`${field.label}은 https 이미지 주소 또는 업로드한 이미지 경로를 입력해 주세요.`);
                    if (field.type === 'datetime-local' && value && !Number.isFinite(Date.parse(String(value)))) fail('날짜를 확인해 주세요.');
                    if (field.options && value !== null && !field.options.includes(String(value))) fail('선택값을 확인해 주세요.');
                    values[field.key] = field.type === 'image' ? assetPath(value, process.env.NEXT_PUBLIC_SUPABASE_URL || '') || null : value;
                }
            }
            if (!body.id) {
                for (const field of section.fields.filter((f) => f.required)) if (!(field.key in values)) fail(`${field.label}을 입력해 주세요.`);
            }
            if (section.table === 'curriculum_missions') {
                const current = body.id ? await db.from('curriculum_missions').select('id,lesson_id').eq('id', body.id).single() : null;
                if (current?.error || (body.id && !current?.data)) fail('미션을 다시 불러온 뒤 저장해 주세요.', 409);
                const lessonId = values.lesson_id || current?.data?.lesson_id;
                if (!uid(lessonId)) fail('연결할 학습을 선택해 주세요.');
                const lesson = await db.from('curriculum_lessons').select('id,week_id').eq('id', lessonId).single();
                if (lesson.error || !lesson.data) fail('연결할 학습을 찾을 수 없습니다.');
                const week = await db.from('curriculum_weeks').select('id,course_id').eq('id', lesson.data.week_id).single();
                if (week.error || !week.data) fail('학습의 상품·주차 연결을 확인해 주세요.');
                // course_id/week_id are validation context, never persisted as mission columns.
                if (input.course_id !== undefined && (!uid(input.course_id) || input.course_id !== week.data.course_id)) fail('선택한 상품에 속한 학습만 연결할 수 있습니다.');
                if (input.week_id && input.week_id !== lesson.data.week_id) fail('선택한 주차에 속한 학습만 연결할 수 있습니다.');
                if (current?.data && current.data.lesson_id !== lessonId) {
                    const previousLesson = await db.from('curriculum_lessons').select('week_id').eq('id', current.data.lesson_id).single();
                    const previousWeek = previousLesson.data ? await db.from('curriculum_weeks').select('course_id').eq('id', previousLesson.data.week_id).single() : null;
                    if (previousLesson.error || previousWeek?.error || previousWeek?.data?.course_id !== week.data.course_id) fail('기존 미션은 다른 상품의 학습으로 이동할 수 없습니다.');
                }
            }
            if (section.table === 'cohorts' && values.capacity !== undefined && values.capacity !== null && (!Number.isSafeInteger(values.capacity) || Number(values.capacity) < 1)) fail('정원은 1명 이상의 정수로 입력해 주세요.');
            if (section.table === 'site_banners') {
                for (const [key, limit] of Object.entries(bannerTextLimits)) {
                    if (!(key in values) || values[key] === null) continue;
                    const copy = String(values[key]).trim();
                    if (copy.length > limit) fail(`${sections.find((item) => item.key === 'banners')?.fields.find((field) => field.key === key)?.label || key}은 ${limit}자 이하로 입력해 주세요.`);
                    values[key] = copy || null;
                }
                if (values.display_order !== undefined && values.display_order !== null && !Number.isSafeInteger(values.display_order)) fail('슬라이드 순서는 정수로 입력해 주세요.');
            }
            if (section.table === 'profiles' && 'phone' in values) {
                try {
                    values.phone = phoneNumber(values.phone);
                } catch (e) {
                    fail((e as Error).message);
                }
            }
            if (section.table === 'profiles') {
                if (!uid(body.id)) fail('기존 회원을 선택해 주세요.');
                const current = await db.from('profiles').select('id,role,status').eq('id', body.id).single();
                if (current.error || !current.data) fail('회원 정보를 다시 불러온 뒤 저장해 주세요.', 409);
                if ('role' in values) {
                    if (user.role !== 'admin') fail('관리자만 계정 권한을 변경할 수 있습니다.', 403);
                    if (body.id === user.id && values.role !== 'admin') fail('현재 로그인한 관리자 권한은 해제할 수 없습니다.');
                    if (current.data.role === 'admin' && values.role !== 'admin') {
                        const admins = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('status', 'active');
                        if (admins.error) fail('관리자 계정 수를 확인하지 못했습니다.', 409);
                        if ((admins.count || 0) <= 1) fail('최소 한 명의 활성 관리자가 필요합니다.');
                    }
                }
                if (current.data.role === 'admin' && values.status !== undefined && values.status !== 'active') {
                    if (body.id === user.id) fail('현재 로그인한 관리자 계정은 정지할 수 없습니다.');
                    const admins = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('status', 'active');
                    if (admins.error) fail('관리자 계정 수를 확인하지 못했습니다.', 409);
                    if ((admins.count || 0) <= 1) fail('최소 한 명의 활성 관리자가 필요합니다.');
                }
            }
            if (['courses', 'articles'].includes(section.table) && values.slug && !/^[a-z0-9-]+$/.test(String(values.slug))) fail('페이지 주소는 영문 소문자·숫자·하이픈으로 입력해 주세요.');
            if (section.table === 'courses') {
                const previous = body.id ? await db.from('courses').select('metadata').eq('id', body.id).single() : { data: null, error: null };
                if (previous.error) fail('기존 상품 정보를 불러오지 못했습니다. 새로고침 후 다시 저장해 주세요.', 409);
                try { values.metadata = mergeProductMetadata(previous.data?.metadata, values); }
                catch (error) { fail((error as Error).message); }
                for (const field of productMetadataFields) delete values[field];
            }
            if (section.table === 'articles' && 'content_blocks' in values) {
                if (!Array.isArray(values.content_blocks) || values.content_blocks.length > 100) fail('본문은 최대 100개까지 추가할 수 있습니다.');
                for (const block of values.content_blocks as Record<string, unknown>[]) {
                    if (!block || typeof block !== 'object') fail('본문 형식을 확인해 주세요.');
                    if (['image', 'video'].includes(String(block.type)) && !safeUrl(block.url || block.src)) fail('본문의 이미지·영상 주소를 확인해 주세요.');
                }
            }
            if (section.table === 'coupons') {
                if (typeof values.code === 'string') values.code = values.code.trim().toUpperCase();
                if (values.discount_type === 'percentage' && Number(values.discount_value) > 100) fail('할인율은 100% 이하여야 합니다.');
                if (values.product_scope === 'specific' && !uid(couponCourseId)) fail('쿠폰을 적용할 상품을 선택해 주세요.');
                if (values.issue_target === 'tag' && !uid(values.target_tag_id)) fail('쿠폰 발급 대상 태그를 선택해 주세요.');
                if (values.issue_target !== 'tag') values.target_tag_id = null;
                for (const key of ['discount_value', 'max_discount_amount', 'minimum_order_amount', 'usage_limit', 'per_user_limit']) {
                    if (values[key] !== null && values[key] !== undefined && (!Number.isSafeInteger(values[key]) || Number(values[key]) < (key === 'minimum_order_amount' || key === 'max_discount_amount' ? 0 : 1))) fail('쿠폰 금액·수량은 허용 범위의 정수로 입력해 주세요.');
                }
            }
            if (section.table === 'crm_tags') {
                values.name = String(values.name || '').trim();
                values.description = String(values.description || '').trim() || null;
                values.color = /^#[0-9a-f]{6}$/i.test(String(values.color || '')) ? values.color : '#667ca0';
                if (values.tag_kind === 'automatic' && !values.rule_key) fail('자동 태그의 조건 행동을 선택해 주세요.');
                if (values.tag_kind === 'manual') values.rule_key = null;
                values.threshold_percent = values.tag_kind === 'automatic' && String(values.rule_key).startsWith('free_lesson_') ? Number(values.threshold_percent || 80) : 100;
                if (!Number.isSafeInteger(values.threshold_percent) || Number(values.threshold_percent) < 1 || Number(values.threshold_percent) > 100) fail('기준 시청률은 1~100 사이 정수로 입력해 주세요.');
            }
            if (values.status === 'published') values.published_at = new Date().toISOString();
            for (const [start, end] of [
                ['recruitment_start_at', 'recruitment_end_at'],
                ['operation_start_at', 'operation_end_at'],
                ['starts_at', 'ends_at'],
            ]) {
                if (values[start] && values[end] && Date.parse(String(values[start])) >= Date.parse(String(values[end]))) fail('종료일은 시작일 이후여야 합니다.');
            }
            if (section.table === 'mission_submissions') {
                const r = await db.rpc('review_mission_submissions', {
                    p_actor: user.id,
                    p_ids: [body.id],
                    p_decision: values.status,
                    p_feedback: values.reviewer_feedback || '',
                });
                if (r.error) fail('검토 대기 상태와 피드백을 확인해 주세요.', 409);
                return reply({ ok: true });
            }
            if (section.table === 'lesson_contents') {
                if (['vod_url', 'resource_storage_path', 'body_text', 'external_url'].filter((k) => values[k]).length !== 1) fail('영상·자료·본문·외부 링크 중 학습 유형에 맞는 하나를 등록해 주세요.');
            }
            if (section.table === 'curriculum_missions' && values.submission_type === 'quiz' && values.is_published) {
                const { data: quiz } = await db
                    .from('mission_quizzes')
                    .select('mission_id')
                    .eq('mission_id', body.id || '')
                    .maybeSingle();
                if (!quiz) fail('미션을 비공개로 저장한 뒤 퀴즈 문항을 등록해 주세요.');
            }
            if (section.table === 'edu_questions') {
                if (!uid(body.id)) fail('질문을 선택해 주세요.');
                values.status = 'answered';
            }
            if (section.table === 'site_settings') {
                if (!String(values.key || body.id).startsWith('edu_')) fail('설정 이름은 edu_로 시작해 주세요.');
                values.is_public = false;
            }
            const key = section.table === 'site_settings' ? 'key' : section.table === 'lesson_contents' ? 'lesson_id' : 'id';
            if (!body.id && !uid(body.requestId)) fail('새 등록 요청을 다시 열고 저장해 주세요.');
            const result = body.id
                ? await db.from(section.table).update(values).eq(key, body.id).select().single()
                : await db.rpc('edu_create_record', {
                      p_actor: user.id,
                      p_request: body.requestId,
                      p_table: section.table,
                      p_values: values,
                  });
            if (result.error) {
                if (!['23505', '23514', '23503', '23502', 'P0001'].includes(result.error.code)) console.error('platform save', result.error.code);
                fail(databaseMessage(result.error.code), 409);
            }
            if (section.table === 'crm_tags') {
                if (input.apply_existing === true) {
                    const synced = await db.rpc('crm_resync_all_automatic_tags');
                    if (synced.error) fail('태그 조건은 저장했지만 기존 회원 태그를 다시 계산하지 못했습니다.', 409);
                }
            }
            if (section.table === 'coupons') {
                const coupon = result.data as Row;
                const couponId = String(coupon.id || body.id || '');
                if (!uid(couponId)) fail('저장된 쿠폰을 다시 불러오지 못했습니다.', 409);
                const removed = await db.from('coupon_products').delete().eq('coupon_id', couponId);
                if (removed.error) fail('쿠폰 적용 상품을 갱신하지 못했습니다.', 409);
                if (values.product_scope === 'specific') {
                    const linked = await db.from('coupon_products').insert({ coupon_id: couponId, course_id: couponCourseId });
                    if (linked.error) fail('쿠폰 적용 상품을 저장하지 못했습니다.', 409);
                }
            }
            let scheduledCohort = null;
            // A cohortless free webinar must stay cohortless when editing its name or copy.
            const keepFreeCourseWithoutCohort = section.table === 'courses' && (result.data as Row).category === 'free'
                && !body.cohortId && !productSchedule?.start && !productSchedule?.end;
            if (section.table === 'courses' && productSchedule && !keepFreeCourseWithoutCohort) {
                const course = result.data as Row;
                const now = Date.now();
                const publishedPaidProduct = course.status === 'published' && course.category !== 'free';
                const recruitmentStart = publishedPaidProduct && productSchedule.start && Date.parse(productSchedule.start) > now
                    ? new Date(now).toISOString()
                    : productSchedule.start;
                const cohortStatus = publishedPaidProduct
                    ? 'recruiting'
                    : productSchedule.end && Date.parse(productSchedule.end) <= now
                    ? 'closed'
                    : productSchedule.start && Date.parse(productSchedule.start) > now
                      ? 'upcoming'
                      : 'recruiting';
                const scheduleValues = {
                    recruitment_start_at: recruitmentStart || null,
                    recruitment_end_at: productSchedule.end || null,
                };
                const cohortResult = body.cohortId
                    ? await db.from('cohorts').update(scheduleValues).eq('id', body.cohortId).eq('course_id', course.id).select().single()
                    : await db.from('cohorts').upsert({
                          course_id: course.id,
                          cohort_code: 'DEFAULT',
                          name: '기본 기수',
                          note: '상품 등록 시 자동 생성',
                          price: Number(course.list_price || 0),
                          capacity: null,
                          status: cohortStatus,
                          ...scheduleValues,
                      }, { onConflict: 'course_id,cohort_code' }).select().single();
                if (cohortResult.error) {
                    if (!body.id) await db.from('courses').delete().eq('id', course.id);
                    fail('상품의 모집 일정을 저장하지 못했습니다. 일정을 확인하고 다시 저장해 주세요.', 409);
                }
                scheduledCohort = cohortResult.data;
            }
            return reply({ ok: true, row: result.data, cohort: scheduledCohort });
        }
        if (action === 'profile') {
            const name = String(body.name || '').trim();
            if (!name || name.length > 80) fail('이름을 확인해 주세요.');
            let phone;
            try {
                phone = phoneNumber(body.phone);
            } catch (e) {
                fail((e as Error).message);
            }
            const r = await db.from('profiles').update({ full_name: name, phone }).eq('id', user.id);
            if (r.error) throw r.error;
            return reply({ ok: true });
        }
        if (action === 'question') {
            const title = String(body.title || '').trim(),
                content = String(body.content || '').trim();
            if (!title || !content || title.length > 200 || content.length > 10000) fail('질문 제목과 내용을 확인해 주세요.');
            if (!uid(body.requestId)) fail('질문 입력 화면을 새로 열고 등록해 주세요.');
            const r = await db.rpc('edu_create_record', {
                p_actor: user.id,
                p_request: body.requestId,
                p_table: 'edu_questions',
                p_values: {
                    user_id: user.id,
                    title,
                    content,
                    course_id: uid(body.courseId) ? body.courseId : null,
                },
            });
            if (r.error) throw r.error;
            return reply({ ok: true });
        }
        if (action === 'order') {
            if (!uid(body.cohortId) || body.agreed !== true) fail('상품과 필수 동의를 확인해 주세요.');
            const offer = await db.from('cohorts').select('*,courses!inner(*)').eq('id', body.cohortId).single();
            if (offer.error || !offer.data) fail('상품 모집 정보를 확인해 주세요.', 409);
            const offeredCourse = offer.data.courses as Row;
            if (offeredCourse.category === 'paid_class') {
                const weeks = await db.from('curriculum_weeks').select('*').eq('course_id', offeredCourse.id).eq('is_published', true);
                if (weeks.error) throw weeks.error;
                const weekIds = (weeks.data || []).map((item) => item.id);
                const lessons = weekIds.length
                    ? await db.from('curriculum_lessons').select('*').in('week_id', weekIds).eq('is_published', true)
                    : { data: [], error: null };
                if (lessons.error) throw lessons.error;
                const metadata = (offeredCourse.metadata && typeof offeredCourse.metadata === 'object' ? offeredCourse.metadata : {}) as Record<string, unknown>;
                const source = String(metadata.detail_html_document || metadata.detail_html || '');
                const issues = paidCourseReadinessIssues(offeredCourse, [offer.data], (weeks.data || []) as Row[], (lessons.data || []) as Row[]);
                if (containsFreeClassCampaign(source)) issues.push('유료 전용 상세 콘텐츠');
                if (issues.length) fail(`판매 준비가 완료되지 않았습니다: ${[...new Set(issues)].join(' · ')}`, 409);
            }
            let phone;
            try {
                phone = phoneNumber(body.phone, true);
            } catch (e) {
                fail((e as Error).message);
            }
            if (!phone || !String(body.name || '').trim()) fail('신청자 이름과 연락처를 확인해 주세요.');
            const r = await db.rpc('create_checkout_order', {
                p_user_id: user.id,
                p_cohort_id: body.cohortId,
                p_customer_name: String(body.name).trim(),
                p_customer_email: user.email,
                p_customer_phone: phone,
                p_terms_version: POLICY_VERSION,
                p_privacy_version: POLICY_VERSION,
                p_refund_policy_version: POLICY_VERSION,
            });
            if (r.error) {
                const msg = r.error.message;
                fail(msg.includes('ALREADY_ENROLLED') ? '이미 신청한 클래스입니다.' : msg.includes('RECRUIT') ? '현재 모집 중인 클래스가 아닙니다.' : msg.includes('CAPACITY') ? '모집 정원이 마감되었습니다.' : '주문을 만들지 못했습니다. 상품 모집 설정을 확인해 주세요.', 409);
            }
            const order = r.data as Record<string, unknown>;
            const coupon = await db.rpc('apply_coupon_to_order', {
                p_order_id: order.orderId,
                p_user_id: user.id,
                p_code: String(body.coupon || '')
                    .trim()
                    .toUpperCase(),
            });
            if (coupon.error) fail('쿠폰의 사용 기간과 적용 상품을 확인해 주세요.', 409);
            const result = { ...order, ...coupon.data };
            if (Number(result.totalAmount) === 0) {
                const free = await db.rpc('finalize_zero_total_order', {
                    p_order_id: order.orderId,
                    p_user_id: user.id,
                });
                if (free.error) throw free.error;
                return reply({ ...result, free: true });
            }
            if (!process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY) fail('결제 서비스 연결을 확인하고 있습니다.', 503);
            return reply(result);
        }
        if (['progress', 'mission', 'review'].includes(action)) {
            if (!uid(body.enrollmentId)) fail('수강 정보를 확인해 주세요.');
            const { data: enrollment, error } = await db.from('enrollments').select('*').eq('id', body.enrollmentId).eq('user_id', user.id).eq('status', 'active').single();
            if (error || !enrollment || !hasLearningAccess(enrollment)) fail('수강 권한이 필요합니다.', 403);
            if (action === 'review') {
                const rating = Number(body.rating);
                const content = String(body.content || '').trim();
                if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !content || content.length > 5000) fail('별점과 후기 내용을 확인해 주세요.');
                const { data: existing } = await db.from('reviews').select('id').eq('user_id', user.id).eq('course_id', enrollment.course_id).maybeSingle();
                const values = {
                    user_id: user.id,
                    course_id: enrollment.course_id,
                    cohort_id: enrollment.cohort_id,
                    author_name: user.full_name || '수강생',
                    rating,
                    body: content,
                    status: 'pending',
                };
                const r = existing ? await db.from('reviews').update(values).eq('id', existing.id) : await db.from('reviews').insert(values);
                if (r.error) throw r.error;
                return reply({ ok: true });
            }
            const lessonId = String(body.lessonId || '');
            const { data: lesson } = await db.from('curriculum_lessons').select('*,curriculum_weeks!inner(course_id,is_published)').eq('id', lessonId).eq('is_published', true).single();
            if (!lesson || lesson.curriculum_weeks.course_id !== enrollment.course_id || !lesson.curriculum_weeks.is_published) fail('공개된 학습이 아닙니다.', 403);
            if (action === 'progress') {
                const r = await db.from('lesson_progress').upsert(
                    {
                        enrollment_id: enrollment.id,
                        lesson_id: lessonId,
                        progress_percent: 100,
                        completed_at: new Date().toISOString(),
                    },
                    { onConflict: 'enrollment_id,lesson_id' },
                );
                if (r.error) throw r.error;
                return reply({ ok: true });
            }
            const { data: mission } = await db.from('curriculum_missions').select('*').eq('id', body.missionId).eq('lesson_id', lessonId).eq('is_published', true).single();
            if (!mission) fail('미션을 확인해 주세요.');
            const content = String(body.content || '').trim();
            if (body.url && !safeUrl(body.url)) fail('결과물 링크를 확인해 주세요.');
            if (content.length > 20000 || (!body.draft && ['text', 'mixed'].includes(mission.submission_type) && !content) || (!body.draft && ['link', 'mixed'].includes(mission.submission_type) && !body.url)) fail('미션 답변을 입력해 주세요.');
            const { data: previous } = await db.from('mission_submissions').select('*').eq('enrollment_id', enrollment.id).eq('mission_id', mission.id).order('attempt_number', { ascending: false }).limit(1).maybeSingle();
            if (previous && ['approved', 'submitted'].includes(previous.status)) fail('이미 제출한 미션입니다. 검토 결과를 확인해 주세요.', 409);
            if (body.draft) {
                const r = await db.from('edu_mission_drafts').upsert(
                    {
                        user_id: user.id,
                        enrollment_id: enrollment.id,
                        mission_id: mission.id,
                        content,
                        url: String(body.url || ''),
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'enrollment_id,mission_id' },
                );
                if (r.error) throw r.error;
                return reply({ ok: true });
            }
            const { data: quizRow, error: quizError } = await db.from('mission_quizzes').select('*').eq('mission_id', mission.id).maybeSingle();
            if (quizError) throw quizError;
            if (!quizRow && mission.submission_type === 'quiz') fail('퀴즈 문항이 준비되지 않았습니다.', 409);
            let grade = null;
            if (quizRow) {
                if (!uid(body.revision)) fail('퀴즈를 다시 불러온 뒤 응시해 주세요.');
                try {
                    grade = gradeQuiz(
                        {
                            questions: quizRow.questions,
                            passPercent: quizRow.pass_percent,
                        } as QuizDefinition,
                        body.answers,
                    );
                } catch (e) {
                    fail((e as Error).message);
                }
            }
            const r = await db.rpc('submit_learning_mission', {
                p_user: user.id,
                p_enrollment: enrollment.id,
                p_mission: mission.id,
                p_response: {
                    text: content,
                    url: String(body.url || ''),
                    ...(quizRow ? { answers: body.answers, score: grade!.score } : {}),
                },
                p_revision: quizRow ? String(body.revision || '') : null,
                p_result: grade,
            });
            if (r.error) fail(/[가-힣]/.test(r.error.message) ? r.error.message : '미션 제출 상태를 확인해 주세요.', 409);
            if (r.data.passed === false)
                return reply({
                    ok: true,
                    passed: false,
                    score: grade!.score,
                    message: `퀴즈 ${grade!.score}점입니다. 통과 기준 ${quizRow!.pass_percent}%를 확인하고 다시 응시해 주세요.`,
                });
            await db.from('edu_mission_drafts').delete().eq('enrollment_id', enrollment.id).eq('mission_id', mission.id);
            return reply({ ok: true, passed: true });
        }
        fail('지원하지 않는 요청입니다.');
    } catch (error) {
        const e = error as Error & {
            status?: number;
        };
        if (!e.status || e.status >= 500) console.error('platform write', (e as Error & { code?: string }).code || 'unexpected');
        return reply(
            {
                error: e.status ? e.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
            },
            e.status || 500,
        );
    }
}
