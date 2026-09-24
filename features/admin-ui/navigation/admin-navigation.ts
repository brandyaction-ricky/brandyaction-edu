import type { AdminContentWidth } from '../components/admin-system';
import {
  BookOpen,
  CalendarDays,
  CheckSquare2,
  FilePenLine,
  Film,
  LayoutGrid,
  LineChart,
  MessageCircle,
  ReceiptText,
  Settings,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

export type AdminNavigationItem = {
  key: string;
  title: string;
};

const adminNavigationIcons: Record<string, LucideIcon> = {
  products: BookOpen,
  cohorts: CalendarDays,
  learning: BookOpen,
  weeks: BookOpen,
  contents: Film,
  missions: BookOpen,
  members: UsersRound,
  reviews: CheckSquare2,
  questions: MessageCircle,
  customers: UsersRound,
  conversion: MessageCircle,
  tags: UsersRound,
  coupons: LayoutGrid,
  'product-reviews': MessageCircle,
  banners: LayoutGrid,
  articles: FilePenLine,
  testimonials: MessageCircle,
  orders: ReceiptText,
  landing: LineChart,
  analytics: LineChart,
  metrics: FilePenLine,
  campaigns: LayoutGrid,
  templates: LayoutGrid,
  automations: LayoutGrid,
  seo: Settings,
  settings: Settings,
  staff: ShieldCheck,
};

export function adminNavigationIcon(key: string): LucideIcon {
  return adminNavigationIcons[key] || LayoutGrid;
}

export const adminNavigationGroups = [
  ['클래스 관리', ['products', 'cohorts', 'weeks', 'learning', 'contents', 'missions', 'members', 'reviews', 'questions']],
  ['고객 관리', ['customers', 'tags', 'coupons', 'product-reviews']],
  ['콘텐츠 관리', ['banners', 'articles', 'testimonials']],
  ['주문·매출', ['orders']],
  ['마케팅·전환', ['conversion', 'landing', 'analytics', 'campaigns', 'templates', 'automations', 'seo', 'settings']],
] as const;

export const adminNavigationTitles: Record<string, string> = {
  conversion: '모집 운영',
  landing: '광고·웨비나 성과',
  learning: '학습 콘텐츠 관리',
  weeks: '주차 구성',
  contents: '영상·자료 관리',
  members: '회원 미션관리',
  tags: '고객 태그 관리',
  'product-reviews': '상품 후기 관리',
  banners: '메인 배너 관리',
  articles: '아티클 관리',
  testimonials: '고객 후기 관리',
};

export const adminSectionDescriptions: Record<string, string> = {
  products: '상품 정보·상세페이지·제공 자료·판매 조건을 한곳에서 관리합니다.',
  learning: '일차별 학습 본문과 확인 퀴즈를 관리합니다.',
  cohorts: '상품의 판매 정보와 실제 교육 일정·정원을 구분해 운영합니다.',
  weeks: '상품별 주차 순서·학습 목표·공개 상태를 관리합니다.',
  contents: '차시별 영상·자료·본문·외부 학습 링크를 관리합니다.',
  missions: '주차별 미션을 구성하고, 학습 자료와 제출 방식을 연결합니다.',
  members: '회원의 진행 상태와 승인 현황을 확인하세요.',
  reviews: '목록을 이동하며 제출 내용을 확인하고 피드백을 남기세요.',
  questions: '학습 중 막힌 지점을 확인하고 답변으로 연결합니다.',
  customers: '회원의 수강·구매 이력과 태그를 함께 관리합니다.',
  conversion: '문의에 필요한 설명을 검토하고 운영자의 결정을 기록합니다.',
  tags: '고객의 수강·구매 행동과 운영 기준으로 태그를 관리합니다.',
  coupons: '할인 금액·기간·수량과 적용 조건을 관리합니다.',
  'product-reviews': '수강 후기를 검토하고 공개 여부와 대표 노출을 관리합니다.',
  banners: '프론트 메인 배너의 문구·이미지·CTA·슬라이드 순서와 노출 기간을 관리합니다.',
  articles: '글·영상 콘텐츠의 편집과 공개 상태를 관리합니다.',
  testimonials: '홈페이지에 노출할 고객 사례와 영상을 관리합니다.',
  orders: '주문·결제·환불 상태와 수강 권한을 함께 확인합니다.',
  landing: '광고 성과를 확인하고, 실측 기록과 캠페인 설정을 관리합니다.',
  analytics: '전체 사이트의 유입 경로와 고객 행동 성과를 확인합니다.',
  metrics: '광고·라이브·결제 실측 데이터를 날짜별로 기록하고 관리합니다.',
  seo: '검색 노출 정보와 측정·인증 코드를 안전하게 관리합니다.',
  settings: '교육 운영 규칙과 광고 측정 설정을 구분해 관리합니다.',
  campaigns: '모집 대상과 발송 결과를 확인하고 캠페인을 운영합니다.',
  templates: '반복 안내에 사용할 승인된 메시지 문구를 관리합니다.',
  automations: '조건별 자동 안내의 사용 상태와 실행 결과를 관리합니다.',
  staff: '운영 스태프별 접근 범위를 확인하고 관리합니다.',
};

export function normalizeAdminSectionKey(current: string) {
  if (current === 'product-editor') return 'products';
  if (current === 'learning-editor') return 'learning';
  return current;
}

export function adminContentWidth(section: string): AdminContentWidth {
  if (['landing', 'analytics', 'orders', 'customers', 'conversion', 'members', 'reviews'].includes(section)) return 'wide';
  if (['seo', 'settings', 'staff'].includes(section)) return 'narrow';
  return 'standard';
}

export function adminSectionTitle(current: string, items: AdminNavigationItem[]) {
  if (current === 'product-editor') return '상품 등록·수정';
  if (current === 'learning-editor') return '학습 콘텐츠 편집';
  const selected = normalizeAdminSectionKey(current);
  return adminNavigationTitles[selected] || items.find(item => item.key === selected)?.title || '운영 홈';
}

// Compatibility names for existing admin screens while imports move to the feature API.
export const finalAdminGroups = adminNavigationGroups;
export const finalAdminTitles = adminNavigationTitles;
export const sectionDescription = adminSectionDescriptions;
