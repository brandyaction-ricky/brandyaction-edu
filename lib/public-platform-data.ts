import { unstable_cache } from 'next/cache';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { imagePreviewUrl } from '@/lib/qa-rules';
import { productDigitalSections, productMetadataFields, productResources } from '@/lib/product-metadata';
import { PUBLIC_CACHE_SECONDS, PUBLIC_CACHE_TAG, PUBLIC_PAGE_SIZE, type PublicView } from '@/lib/public-platform-plan';
import type { Row } from '@/lib/platform';

type PublicResult = { data: Record<string, Row[]>; pagination: { page: number; pageSize: number; total: number } | null; unlistedBannerCourses?: Row[] };
const cardColumns = 'id,slug,title,summary,category,list_price,duration_label,schedule_label,display_order,thumb:metadata->>thumbnailUrl,legacy_thumb:metadata->>thumbnail_url,product_type:metadata->>productType';
const articleCardColumns = 'id,slug,title,summary,category_id,content_type,cover_image_path,cover_image_alt,published_at,is_featured';

function publicDb() {
  const { publicUrl, publishableKey } = getSupabasePublicConfig();
  // No cookies or service key: the cached read is identical for every visitor
  // and remains subject to the database's public RLS policies.
  return createSupabaseClient(publicUrl, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function rows<T extends { data: unknown; error: { message: string } | null }>(result: T): Row[] {
  if (result.error) throw new Error(result.error.message);
  return (result.data || []) as Row[];
}

function card(row: Row): Row {
  const { thumb, legacy_thumb, product_type, ...rest } = row;
  const image = thumb || legacy_thumb;
  const metadata: Record<string, unknown> = {};
  if (image) metadata.thumbnailUrl = imagePreviewUrl(String(image), process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  if (product_type) metadata.productType = product_type;
  return { ...rest, metadata };
}

function article(row: Row): Row {
  const image = row.cover_image_path;
  return image ? { ...row, cover_image_url: imagePreviewUrl(String(image), process.env.NEXT_PUBLIC_SUPABASE_URL || '') } : row;
}

function safeCourse(row: Row): Row {
  const source = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)) ? row.metadata as Record<string, unknown> : {};
  // Course metadata is extensible. Only fields needed by the public detail may
  // enter the shared snapshot; unknown/private metadata remains server-side.
  const metadata: Record<string, unknown> = {};
  for (const key of [...productMetadataFields, 'thumbnailUrl', 'detailImageUrl', 'productType', 'product_resources', 'digital_content_sections']) {
    if (Object.hasOwn(source, key)) metadata[key] = source[key];
  }
  for (const key of ['thumbnailUrl', 'thumbnail_url', 'detailImageUrl', 'detail_image_url']) {
    const value = metadata[key];
    if (typeof value === 'string') metadata[key] = imagePreviewUrl(value, process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  }
  if (Array.isArray(metadata.detail_images)) metadata.detail_images = metadata.detail_images.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const image = { ...(entry as Record<string, unknown>) };
    if (typeof image.path === 'string') image.path = imagePreviewUrl(image.path, process.env.NEXT_PUBLIC_SUPABASE_URL || '');
    return image;
  });
  if (Array.isArray(metadata.product_resources)) metadata.product_resources = productResources(metadata).map(resource => ({ id: resource.id, name: resource.name, scope: resource.scope }));
  if (Array.isArray(metadata.digital_content_sections)) metadata.digital_content_sections = productDigitalSections(metadata).map(section => ({ ...section, items: section.items.map(item => ({ ...item, videoUrl: '' })) }));
  const publicCourse: Row = { id: row.id };
  for (const key of ['id', 'slug', 'title', 'summary', 'description', 'category', 'instructor_name', 'list_price', 'duration_label', 'schedule_label', 'status', 'display_order']) {
    if (Object.hasOwn(row, key)) publicCourse[key] = row[key];
  }
  return { ...publicCourse, metadata };
}

export async function readPublicPlatformDataUncached(view: PublicView, slug: string, cohortId: string, page: number, query: string, filter: string): Promise<PublicResult> {
  const db = publicDb();
  const data: Record<string, Row[]> = {};
  let pagination: PublicResult['pagination'] = null;
  let unlistedBannerCourses: Row[] = [];
  if (view === 'home') {
    const [courses, articles, stories, banners] = await Promise.all([
      db.from('courses').select(cardColumns).eq('status', 'published').is('archived_at', null).or('metadata->is_listed.is.null,metadata->is_listed.neq.false').order('display_order').limit(12),
      db.from('articles').select(articleCardColumns).eq('status', 'published').order('published_at', { ascending: false }).limit(3),
      db.from('review_videos').select('id,title,reviewer_name,reviewer_role,description,video_url,thumbnail_url,display_order').eq('is_published', true).order('display_order').limit(12),
      db.from('site_banners').select('id,eyebrow,title,description,link_url,link_label,image_path,starts_at,ends_at,display_order').eq('is_active', true).order('display_order').limit(12),
    ]);
    data.courses = rows(courses).map(card);
    const ids = data.courses.map(course => course.id);
    if (ids.length) data.cohorts = rows(await db.from('cohorts').select('id,course_id,status,recruitment_start_at,recruitment_end_at,operation_end_at').in('course_id', ids).order('created_at', { ascending: false }).limit(100));
    data.articles = rows(articles).map(article);
    data.review_videos = rows(stories);
    data.site_banners = rows(banners).map(banner => ({ ...banner, image_url: imagePreviewUrl(String(banner.image_path || ''), process.env.NEXT_PUBLIC_SUPABASE_URL || '') }));
    const bannerKeys = [...new Set(data.site_banners.flatMap(banner => {
      try {
        const match = /^\/classes\/([^/]+)\/?$/.exec(new URL(String(banner.link_url || ''), 'https://brandyaction-edu.com').pathname);
        const key = match ? decodeURIComponent(match[1]) : '';
        return /^[a-zA-Z0-9_-]{1,180}$/.test(key) ? [key] : [];
      } catch { return []; }
    }))];
    if (bannerKeys.length) {
      const uuidKeys = bannerKeys.filter(key => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key));
      const [bySlug, byId] = await Promise.all([
        db.from('courses').select('id,slug,listed:metadata->is_listed').in('slug', bannerKeys).limit(12),
        uuidKeys.length ? db.from('courses').select('id,slug,listed:metadata->is_listed').in('id', uuidKeys).limit(12) : Promise.resolve({ data: [], error: null }),
      ]);
      const targets = [...rows(bySlug), ...rows(byId)];
      unlistedBannerCourses = targets.filter(course => course.listed === false).map(course => ({ id: course.id, slug: course.slug, metadata: { is_listed: false } }));
    }
  } else if (view === 'classes') {
    let courses = db.from('courses').select(cardColumns, { count: 'exact' }).eq('status', 'published').is('archived_at', null).or('metadata->is_listed.is.null,metadata->is_listed.neq.false');
    if (query) courses = courses.ilike('title', `%${query.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`);
    if (filter === '무료 클래스') courses = courses.eq('list_price', 0).neq('category', 'digital');
    if (filter === '유료 클래스') courses = courses.gt('list_price', 0).neq('category', 'digital');
    if (filter === '디지털 상품') courses = courses.eq('category', 'digital');
    const result = await courses.order('display_order').range((page - 1) * PUBLIC_PAGE_SIZE, page * PUBLIC_PAGE_SIZE - 1);
    data.courses = rows(result).map(card);
    pagination = { page, pageSize: PUBLIC_PAGE_SIZE, total: result.count || 0 };
    const ids = data.courses.map(course => course.id);
    if (ids.length) data.cohorts = rows(await db.from('cohorts').select('id,course_id,status,recruitment_start_at,recruitment_end_at,operation_end_at').in('course_id', ids).limit(100));
  } else if (view === 'class') {
    let courseQuery = db.from('courses').select('id,slug,title,summary,description,category,instructor_name,list_price,duration_label,schedule_label,status,metadata').eq('status', 'published').is('archived_at', null);
    courseQuery = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(slug) ? courseQuery.eq('id', slug) : courseQuery.eq('slug', slug);
    const courseResult = await courseQuery.limit(1);
    data.courses = rows(courseResult).map(safeCourse);
    const course = data.courses[0];
    if (course) {
      const [cohorts, weeks, reviews] = await Promise.all([
        db.from('cohorts').select('id,course_id,name,price,capacity,status,recruitment_start_at,recruitment_end_at,operation_start_at,operation_end_at').eq('course_id', course.id).order('created_at', { ascending: false }).limit(50),
        db.from('curriculum_weeks').select('id,course_id,week_number,title,goal,display_order,is_published').eq('course_id', course.id).eq('is_published', true).order('week_number').limit(100),
        db.from('reviews').select('id,course_id,author_name,author_nickname,rating,body,is_featured,display_order,published_at').eq('course_id', course.id).eq('status', 'published').order('display_order').limit(30),
      ]);
      data.cohorts = rows(cohorts);
      data.curriculum_weeks = rows(weeks);
      data.reviews = rows(reviews);
      const weekIds = data.curriculum_weeks.map(week => week.id);
      if (weekIds.length) data.curriculum_lessons = rows(await db.from('curriculum_lessons').select('id,week_id,day_number,title,description,content_type,duration_label,is_preview,is_published,display_order').in('week_id', weekIds).eq('is_published', true).order('display_order').limit(200));
      if (Number(course.list_price) === 0) {
        const admin = createAdminClient();
        const configs = await admin.from('landing_configs').select('id,enabled,kakao_url,cta_label,pixel_enabled,pixel_id,layout_ver,revision,campaign_start,campaign_end,sections,custom_sections,thresholds').eq('id', course.id).limit(1);
        data.landing_configs = rows(configs);
        const config = data.landing_configs[0];
        if (config && config.layout_ver) {
          const snapshots = await admin.from('section_snapshots').select('content').eq('landing_id', course.id).eq('layout_ver', config.layout_ver).limit(1);
          const frozen = (rows(snapshots)[0]?.content as Record<string, unknown> | undefined)?.course;
          if (frozen && typeof frozen === 'object') config.course_snapshot = safeCourse(frozen as Row);
        }
      }
    }
  } else if (view === 'articles') {
    let articles = db.from('articles').select(articleCardColumns, { count: 'exact' }).eq('status', 'published');
    if (query) articles = articles.ilike('title', `%${query.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`);
    if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(filter)) articles = articles.eq('category_id', filter);
    const [result, categories, setting] = await Promise.all([
      articles.order('published_at', { ascending: false }).range((page - 1) * PUBLIC_PAGE_SIZE, page * PUBLIC_PAGE_SIZE - 1),
      db.from('article_categories').select('id,name,slug,display_order,is_active').eq('is_active', true).order('display_order').limit(100),
      createAdminClient().from('site_settings').select('key,value').eq('key', 'edu_article_banner').limit(1),
    ]);
    data.articles = rows(result).map(article);
    data.article_categories = rows(categories);
    pagination = { page, pageSize: PUBLIC_PAGE_SIZE, total: result.count || 0 };
    const value = rows(setting)[0]?.value as Record<string, unknown> | undefined;
    const banner = value || { enabled: true, eyebrow: 'FREE CLASS · 사업자 무료 3강', title: '사업자를 위한 마케팅·AI 매출 진단', description: '광고비를 더 쓰기 전에 고객 유입, 콘텐츠, 전환, 재구매 중 어디에서 매출이 막히는지 먼저 확인합니다.', signupNotice: '무료 회원가입을 완료하면 사업자용 3강 전체를 바로 볼 수 있습니다. 별도 결제는 필요 없습니다.', signupCTA: '무료 회원가입하고 3강 보기', memberCTA: '아티클 읽으러 가기', videos: [{ title: '매출을 막는 마케팅 병목 찾기', url: '' }, { title: 'AI로 줄일 일과 사람이 결정할 일', url: '' }, { title: '7일 안에 실행할 매출 실험 설계', url: '' }] };
    data.article_banner = [{ id: 'edu_article_banner', value: {
      enabled: banner.enabled !== false,
      eyebrow: String(banner.eyebrow || '').slice(0, 80), title: String(banner.title || '').slice(0, 120),
      description: String(banner.description || '').slice(0, 240), signupNotice: String(banner.signupNotice || '').slice(0, 220),
      signupCTA: String(banner.signupCTA || '').slice(0, 45), memberCTA: String(banner.memberCTA || '').slice(0, 45),
      videos: Array.isArray(banner.videos) ? banner.videos.slice(0, 3).map((item: unknown) => ({ title: String((item as Row)?.title || ''), available: Boolean((item as Row)?.url), url: '' })) : [],
    } }];
  } else if (view === 'article') {
    const result = await db.from('articles').select('id,slug,title,summary,content_type,content_blocks,video_url,published_at,cover_image_path,cover_image_alt,category_id').eq('status', 'published').eq('slug', slug).limit(1);
    data.articles = rows(result).map(article);
    if (data.articles.length) {
      const related = await db.from('articles').select(articleCardColumns).eq('status', 'published').neq('id', data.articles[0].id).order('published_at', { ascending: false }).limit(2);
      data.articles.push(...rows(related).map(article));
    }
  } else if (view === 'stories') {
    const result = await db.from('review_videos').select('id,title,reviewer_name,reviewer_role,description,video_url,thumbnail_url,display_order').eq('is_published', true).order('display_order').limit(100);
    data.review_videos = rows(result);
  } else if (view === 'checkout') {
    const offer = await db.from('cohorts').select('id,course_id,name,price,capacity,status,recruitment_start_at,recruitment_end_at,operation_start_at,operation_end_at').eq('id', cohortId).limit(1);
    data.cohorts = rows(offer);
    if (data.cohorts.length) {
      const course = await db.from('courses').select('id,slug,title,summary,category,list_price,duration_label,schedule_label,status').eq('id', data.cohorts[0].course_id).eq('status', 'published').limit(1);
      data.courses = rows(course);
    }
  }
  return { data, pagination, unlistedBannerCourses };
}

export const getPublicPlatformData = unstable_cache(readPublicPlatformDataUncached, ['edu-public-platform-v1'], { tags: [PUBLIC_CACHE_TAG], revalidate: PUBLIC_CACHE_SECONDS });

export const getPublicSupport = unstable_cache(async () => {
  const settings = await createAdminClient().from('site_settings').select('key,value').in('key', ['edu_operations', 'support_email']).limit(2);
  const values = rows(settings);
  const operations = (values.find(row => row.key === 'edu_operations')?.value || {}) as Record<string, unknown>;
  const legacy = values.find(row => row.key === 'support_email')?.value;
  return {
    email: typeof operations.supportEmail === 'string' ? operations.supportEmail : typeof legacy === 'string' ? legacy : '',
    url: typeof operations.supportUrl === 'string' ? operations.supportUrl : '',
  };
}, ['edu-public-support-v1'], { tags: [PUBLIC_CACHE_TAG], revalidate: PUBLIC_CACHE_SECONDS });
