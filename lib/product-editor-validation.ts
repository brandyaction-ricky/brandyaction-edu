import type { Row } from './platform';
import { productSalesStatus } from './platform-rules';
import { productConversion } from './product-conversion';

export type ProductInputError = { field: string; tab: string; message: string; cohortId?: string };

// Present the existing sales rules as actionable field errors; do not change
// checkout eligibility or the separate cohort save contract.
export function productInputErrors(course: Row, cohorts: Row[], selectedId: string, now: number): ProductInputError[] {
  const errors: ProductInputError[] = [];
  const add = (field: string, tab: string, message: string, cohortId?: string) => {
    if (!errors.some(error => error.field === field && error.cohortId === cohortId)) errors.push({ field, tab, message, cohortId });
  };
  for (const cohort of cohorts) {
    if (cohort.recruitment_start_at && cohort.recruitment_end_at && Date.parse(String(cohort.recruitment_start_at)) >= Date.parse(String(cohort.recruitment_end_at))) {
      add('recruitment_end_at', 'basic', `${cohort.name || '기수'}의 모집 마감은 모집 시작 이후로 입력해 주세요.`, cohort.id);
    }
  }
  if (course.status !== 'published') return errors;
  const metadata = (course.metadata || {}) as Record<string, unknown>;
  const sale = productSalesStatus(course, cohorts, now, Boolean(productConversion(metadata).url));
  const selected = cohorts.find(item => item.id === selectedId) || cohorts[0];
  const cohortTab = course.category === 'digital' ? 'access' : 'cohorts';
  if (sale.issues.includes('판매 기수·모집 기간')) {
    if (selected?.archived_at) add('cohort_status', cohortTab, '보관된 기수는 판매할 수 없습니다. 판매할 기수를 선택해 주세요.');
    if (!selected || Number(selected.price) <= 0) add(selected?.id === 'new-product-cohort' ? 'list_price' : 'cohort_price', selected?.id === 'new-product-cohort' ? 'basic' : cohortTab, '판매가를 0원보다 크게 입력해 주세요.');
    if (!selected?.recruitment_end_at) add('recruitment_end_at', 'basic', '모집 마감일을 입력해 주세요.');
  }
  if (sale.issues.includes('학습 기간')) add('duration_label', 'access', '수강 기간을 입력해 주세요. 예: 6주 과정');
  if (sale.issues.includes('일정 안내')) add('schedule_label', 'basic', '교육 일정을 입력해 주세요. 예: 10월 5일 시작');
  if (sale.issues.includes('상세 콘텐츠')) add('detail_content', 'detail', '상세페이지 이미지 또는 HTML 파일을 등록해 주세요.');
  if (sale.issues.some(issue => issue.startsWith('신청 가능한 기수 없음') || issue === '연결 기수 없음')) {
    if (selected?.recruitment_end_at && Date.parse(String(selected.recruitment_end_at)) <= now) add('recruitment_end_at', 'basic', '모집 마감일이 지났습니다. 판매하려면 마감일을 변경해 주세요.');
    else if (selected?.operation_end_at && Date.parse(String(selected.operation_end_at)) <= now) add('cohort_operation_end_at', cohortTab, '교육이 종료된 기수입니다. 운영 종료일을 변경하거나 다른 기수를 선택해 주세요.');
    else if (selected?.status === 'recruiting' && selected.recruitment_start_at && Date.parse(String(selected.recruitment_start_at)) > now) add('recruitment_start_at', 'basic', '모집 시작 전입니다. 지금 판매하려면 모집 시작일을 변경해 주세요.');
    else if (selected?.status === 'upcoming' && !selected.recruitment_end_at) add('recruitment_end_at', 'basic', '준비 중인 기수를 판매하려면 모집 마감일을 입력해 주세요.');
    else add('cohort_status', cohortTab, '판매할 기수를 선택하고 기수 상태를 모집 중으로 저장해 주세요.');
  }
  return errors;
}
