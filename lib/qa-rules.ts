import type { Row } from './platform';

export function phoneNumber(value: unknown, required = false): string | null {
  const raw = String(value ?? '').trim();
  if (!raw && !required) return null;
  if (!/^[0-9+()\s-]+$/.test(raw)) throw new Error('연락처는 숫자와 하이픈으로 입력해 주세요.');
  const digits = raw.replace(/\D/g, '');
  if (!/^0\d{8,10}$/.test(digits)) throw new Error('연락처를 확인해 주세요. 예: 010-1234-5678');
  return digits;
}

export function cohortStatus(cohort: Row, now = Date.now()): string {
  const stored = String(cohort.status || 'upcoming');
  if (['cancelled', 'completed', 'closed'].includes(stored)) return stored;
  const at = (key: string) => cohort[key] ? Date.parse(String(cohort[key])) : NaN;
  if (at('operation_end_at') <= now) return 'completed';
  if (at('operation_start_at') <= now) return 'in_progress';
  if (at('recruitment_end_at') <= now) return 'closed';
  if (at('recruitment_start_at') > now) return 'upcoming';
  return stored;
}

export function cohortPeriod(cohort?: Row): string {
  if (!cohort) return '일정 추후 안내';
  const format = (v: unknown) => v ? new Date(String(v)).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '';
  return [format(cohort.operation_start_at), format(cohort.operation_end_at)].filter(Boolean).join(' ~ ') || '일정 추후 안내';
}

export function assetPath(value: unknown, supabaseUrl: string): string {
  if (!value) return '';
  const raw = String(value).trim();
  const prefix = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/course-assets/`;
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
}

export function validImage(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  const raw = value.trim();
  if (/^https:\/\//i.test(raw)) {
    try { const u = new URL(raw); return !u.username && !u.password; } catch { return false; }
  }
  return /^(?:\/?(?:edu|site|images|assets|courses)\/)[A-Za-z0-9_./%-]+\.(?:png|jpe?g|webp|gif|avif)$/i.test(raw) && !raw.includes('..');
}

export function databaseMessage(code?: string): string {
  if (code === '23505') return '이미 사용 중인 코드·주소·순서입니다. 다른 값을 입력해 주세요.';
  if (code === '23514') return '허용 범위를 벗어난 값입니다. 정원·금액·날짜·상태를 확인해 주세요.';
  if (code === '23503') return '연결된 상품·기수·회원이 없거나 다른 데이터에서 사용 중입니다.';
  if (code === '23502') return '필수 항목을 모두 입력해 주세요.';
  return '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

// Only dependencies used by the current screen. Analytics is always aggregated by RPC.
export const adminTables: Record<string, string[]> = {
  home: ['courses', 'cohorts', 'mission_submissions', 'edu_questions'],
  products: ['courses', 'cohorts'], cohorts: ['courses', 'cohorts', 'cohort_sessions', 'cohort_session_contents'],
  learning: ['courses', 'curriculum_weeks', 'curriculum_lessons', 'lesson_contents', 'curriculum_missions', 'mission_quizzes'],
  weeks: ['courses', 'curriculum_weeks'],
  contents: ['courses', 'curriculum_weeks', 'curriculum_lessons', 'lesson_contents'],
  missions: ['courses', 'curriculum_weeks', 'curriculum_lessons', 'curriculum_missions', 'mission_quizzes'],
  members: ['courses', 'cohorts'],
  reviews: ['courses', 'cohorts', 'enrollments', 'profiles', 'curriculum_missions', 'mission_submissions'],
  questions: ['courses', 'edu_questions', 'profiles'],
  customers: ['profiles', 'crm_tags', 'crm_member_tags', 'coupons', 'courses', 'cohorts', 'enrollments'],
  staff: ['profiles', 'site_settings'],
  tags: ['crm_tags'], coupons: ['coupons'], 'product-reviews': ['courses', 'reviews', 'profiles'],
  banners: ['site_banners'], articles: ['articles', 'site_settings'], testimonials: ['review_videos'],
  templates: ['crm_templates'], campaigns: ['crm_campaigns', 'crm_templates', 'crm_tags', 'crm_message_logs'],
  automations: ['crm_automations', 'crm_automation_runs', 'crm_templates', 'crm_tags', 'courses'],
  orders: ['courses', 'cohorts', 'orders', 'order_items', 'payments', 'enrollments', 'edu_refund_requests'],
  analytics: [], metrics: ['site_settings'], seo: ['site_settings'], settings: ['site_settings'],
};

export const archiveValues: Record<string, Record<string, unknown>> = {
  products: { status: 'archived' }, cohorts: { status: 'cancelled' },
  learning: { is_published: false }, weeks: { is_published: false }, missions: { is_published: false },
  coupons: { is_active: false }, 'product-reviews': { status: 'hidden', is_featured: false },
  banners: { is_active: false }, articles: { status: 'hidden', is_featured: false },
  testimonials: { is_published: false }, questions: { is_archived: true },
};
