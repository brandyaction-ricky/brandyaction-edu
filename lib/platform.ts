export type Row = {
    id: string;
    [key: string]: unknown;
};
export type User = {
    id: string;
    email: string;
    full_name: string | null;
    phone: string | null;
    role: string;
    marketing_consent?: boolean;
    permissions?: Record<string, boolean>;
};
export type Snapshot = {
    user: User | null;
    data: Record<string, Row[]>;
    error?: string;
};
export const text = (r: Row | undefined, key: string, fallback = '') => String(r?.[key] ?? fallback);
export const number = (r: Row | undefined, key: string) => Number(r?.[key] || 0);
export const object = (r: Row | undefined, key: string): Record<string, unknown> => (r?.[key] && typeof r[key] === 'object' && !Array.isArray(r[key]) ? r[key] : {}) as Record<string, unknown>;
export const money = (v: number) => v.toLocaleString('ko-KR') + '원';
export const date = (v: unknown) => v ? String(v).slice(0, 10).replaceAll('-', '.') : '—';
export const safeUrl = (value: unknown) => { if (typeof value !== 'string' || !value.trim() || ['undefined', 'null'].includes(value.trim()) || !/^(https?:\/\/|\/(?!\/))/.test(value.trim()) || /[\\\u0000-\u001f]/.test(value)) return ''; try {
    const url = new URL(String(value), 'https://brandyaction-edu.com');
    return ['https:', 'http:'].includes(url.protocol) ? String(value) : '';
}
catch {
    return '';
} };
export function safeNext(value: string | null) { return value && /^\/(?![\\/])/.test(value) && !/[\\\u0000-\u001f]/.test(value) ? value : '/my'; }
export const labels: Record<string, string> = { suspended: '이용 정지', open: '답변 대기', answered: '답변 완료', fixed: '정액 할인', percentage: '정률 할인', hidden: '숨김', vod: '영상', material: '학습 자료', column: '칼럼', video: '영상', published: '공개', draft: '임시저장', archived: '보관', active: '활성', inactive: '비활성', paid: '결제 완료', pending: '대기', approved: '승인 완료', returned: '보완 요청', changes_requested: '보완 요청', submitted: '검토 대기', rejected: '반려', completed: '완료', quiz: '퀴즈', text: '텍스트', link: '링크', mixed: '텍스트와 링크', payment_failed: '결제 실패', partially_refunded: '부분 환불', available: '사용 가능', used: '사용 완료', revoked: '회수', upcoming: '준비 중', in_progress: '운영 중', cancelled: '취소', refunded: '환불 완료', recruiting: '모집 중', closed: '모집 마감', scheduled: '예정', free: '무료 클래스', paid_class: '유료 클래스', digital: '디지털 상품' };
export type Field = {
    key: string;
    label: string;
    type?: string;
    required?: boolean;
    options?: string[];
};
export type Section = {
    key: string;
    title: string;
    group: string;
    table: string;
    fields: Field[];
    readOnly?: boolean;
};
const f = (key: string, label: string, type = 'text', required = false, options?: string[]): Field => ({ key, label, type, required, options });
export const sections: Section[] = [
    { key: 'products', title: '상품 관리', group: '클래스 관리', table: 'courses', fields: [f('title', '상품명', 'text', true), f('course_code', '상품 코드', 'text', true), f('slug', '페이지 주소', 'text', true), f('category', '상품 유형', 'select', false, ['free', 'paid_class', 'digital']), f('summary', '한 줄 소개'), f('description', '상세 설명', 'textarea'), f('instructor_name', '강사명'), f('list_price', '판매가', 'number'), f('duration_label', '수강 기간'), f('schedule_label', '일정 안내'), f('status', '공개 상태', 'select', false, ['draft', 'published', 'archived']), f('thumbnail_url', '목록 이미지', 'image'), f('detail_image_url', '상세페이지 이미지', 'image')] },
    { key: 'cohorts', title: '기수·회차 관리', group: '클래스 관리', table: 'cohorts', fields: [f('course_id', '상품', 'course', true), f('name', '기수명', 'text', true), f('cohort_code', '기수 코드', 'text', true), f('price', '기수 판매가', 'number', true), f('capacity', '정원', 'number'), f('recruitment_start_at', '모집 시작', 'datetime-local'), f('recruitment_end_at', '모집 마감', 'datetime-local'), f('operation_start_at', '운영 시작', 'datetime-local'), f('operation_end_at', '운영 종료', 'datetime-local'), f('status', '상태', 'select', false, ['upcoming', 'recruiting', 'closed', 'in_progress', 'completed', 'cancelled'])] },
    { key: 'learning', title: '학습 콘텐츠', group: '클래스 관리', table: 'curriculum_lessons', fields: [f('week_id', '주차', 'week', true), f('day_number', '학습 순서', 'number', true), f('title', '학습 제목', 'text', true), f('description', '학습 안내', 'textarea'), f('content_type', '콘텐츠 유형', 'select', true, ['vod', 'material', 'text', 'link']), f('duration_label', '학습 시간'), f('is_published', '공개', 'checkbox'), f('is_preview', '무료 미리보기', 'checkbox')] },
    { key: 'weeks', title: '주차 구성', group: '클래스 관리', table: 'curriculum_weeks', fields: [f('course_id', '상품', 'course', true), f('week_number', '주차', 'number', true), f('title', '주차 제목', 'text', true), f('goal', '학습 목표', 'textarea'), f('is_published', '공개', 'checkbox')] },
    { key: 'contents', title: '영상·자료 등록', group: '클래스 관리', table: 'lesson_contents', fields: [f('lesson_id', '학습', 'lesson', true), f('vod_url', '영상 URL', 'url'), f('resource_name', '자료명'), f('resource_storage_path', '학습 자료', 'resource'), f('body_text', '학습 본문', 'textarea'), f('external_url', '외부 학습 링크', 'url')] },
    { key: 'missions', title: '미션 관리', group: '클래스 관리', table: 'curriculum_missions', fields: [f('lesson_id', '학습', 'lesson', true), f('title', '미션 제목', 'text', true), f('instructions', '미션 안내', 'textarea'), f('submission_type', '제출 방식', 'select', false, ['text', 'link', 'mixed', 'quiz']), f('is_required', '필수 미션', 'checkbox'), f('is_published', '공개', 'checkbox')] },
    { key: 'members', title: '회원 미션', group: '클래스 관리', table: 'mission_submissions', readOnly: true, fields: [] },
    { key: 'reviews', title: '제출물 검토', group: '클래스 관리', table: 'mission_submissions', fields: [f('status', '검토 결과', 'select', true, ['approved', 'changes_requested', 'rejected']), f('reviewer_feedback', '피드백', 'textarea')] },
    { key: 'questions', title: '질문함', group: '클래스 관리', table: 'edu_questions', fields: [f('answer', '답변', 'textarea', true), f('status', '상태', 'select', false, ['open', 'answered']), f('is_archived', '질문 보관', 'checkbox')] },
    { key: 'customers', title: '회원 관리', group: '고객 관리', table: 'profiles', fields: [f('full_name', '이름'), f('phone', '연락처'), f('status', '상태', 'select', false, ['active', 'suspended'])] },
    { key: 'staff', title: '스태프 권한', group: '고객 관리', table: 'profiles', readOnly: true, fields: [] },
    { key: 'tags', title: '고객 태그', group: '고객 관리', table: 'crm_tags', fields: [f('name', '태그명', 'text', true), f('color', '태그 색상', 'color'), f('description', '설명', 'textarea')] },
    { key: 'coupons', title: '쿠폰 관리', group: '고객 관리', table: 'coupons', fields: [f('name', '쿠폰명', 'text', true), f('code', '쿠폰 코드', 'text', true), f('discount_type', '할인 유형', 'select', true, ['fixed', 'percentage']), f('discount_value', '할인 금액 / 비율', 'number', true), f('usage_limit', '총 사용 한도', 'number'), f('starts_at', '사용 시작', 'datetime-local'), f('ends_at', '사용 종료', 'datetime-local'), f('is_active', '사용 가능', 'checkbox')] },
    { key: 'product-reviews', title: '상품 후기', group: '고객 관리', table: 'reviews', fields: [f('status', '공개 상태', 'select', false, ['pending', 'published', 'hidden']), f('is_featured', '대표 후기', 'checkbox')] },
    { key: 'banners', title: '메인 배너', group: '콘텐츠 관리', table: 'site_banners', fields: [f('eyebrow', '상단 문구'), f('title', '제목', 'text', true), f('description', '설명', 'textarea'), f('image_path', '배너 이미지', 'image'), f('link_label', '버튼 이름'), f('link_url', '연결 주소', 'url'), f('is_active', '사용', 'checkbox'), f('display_order', '노출 순서', 'number'), f('starts_at', '노출 시작', 'datetime-local'), f('ends_at', '노출 종료', 'datetime-local')] },
    { key: 'articles', title: '아티클', group: '콘텐츠 관리', table: 'articles', fields: [f('title', '제목', 'text', true), f('slug', '페이지 주소', 'text', true), f('summary', '요약', 'textarea'), f('cover_image_path', '대표 썸네일', 'image'), f('cover_image_alt', '대표 썸네일 대체 문구'), f('content_type', '종류', 'select', false, ['column', 'video']), f('content_blocks', '아티클 본문', 'blocks'), f('video_url', '영상 URL', 'url'), f('status', '공개 상태', 'select', false, ['draft', 'published', 'hidden']), f('is_featured', '대표 노출', 'checkbox')] },
    { key: 'testimonials', title: '고객 후기', group: '콘텐츠 관리', table: 'review_videos', fields: [f('title', '제목', 'text', true), f('reviewer_name', '고객명', 'text', true), f('reviewer_role', '직업'), f('description', '내용', 'textarea'), f('video_url', '영상 URL', 'url', true), f('thumbnail_url', '썸네일', 'image'), f('is_published', '공개', 'checkbox')] },
    { key: 'orders', title: '주문 결제', group: '매출 관리', table: 'orders', readOnly: true, fields: [] },
    { key: 'templates', title: '메시지 템플릿', group: '마케팅 관리', table: 'crm_templates', fields: [] },
    { key: 'campaigns', title: '캠페인 발송', group: '마케팅 관리', table: 'crm_campaigns', fields: [] },
    { key: 'automations', title: '자동 메시지', group: '마케팅 관리', table: 'crm_automations', fields: [] },
    { key: 'analytics', title: '랜딩 성과', group: '마케팅 관리', table: 'customer_journey_events', readOnly: true, fields: [] },
    { key: 'metrics', title: '실측 입력', group: '마케팅 관리', table: 'site_settings', fields: [f('key', '기간 / 캠페인 코드', 'text', true), f('value', '지표 (JSON)', 'json', true)] },
    { key: 'seo', title: '검색코드 설정', group: '마케팅 관리', table: 'site_settings', fields: [f('key', '설정명', 'text', true), f('value', '설정값 (JSON)', 'json', true)] },
    { key: 'settings', title: '운영·트래킹 설정', group: '마케팅 관리', table: 'site_settings', fields: [f('key', '설정명', 'text', true), f('value', '설정값 (JSON)', 'json', true)] },
];
