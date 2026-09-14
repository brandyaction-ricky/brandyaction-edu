begin;

-- 상품 편집기의 "판매 중" 상태를 실제 구매 가능 상태와 맞춘다.
-- 마감 또는 운영 종료 전인 유료 상품의 예정 기수는 즉시 판매를 시작한다.
update public.cohorts as cohort
set
  status = 'recruiting',
  recruitment_start_at = least(coalesce(cohort.recruitment_start_at, now()), now()),
  updated_at = now()
from public.courses as course
where course.id = cohort.course_id
  and course.status = 'published'
  and course.category <> 'free'
  and cohort.status = 'upcoming'
  and cohort.recruitment_end_at is not null
  and cohort.recruitment_end_at > now()
  and (cohort.operation_end_at is null or cohort.operation_end_at > now());

commit;
