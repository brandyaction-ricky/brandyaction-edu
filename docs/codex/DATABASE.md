# Database and Migration Rules

## 1. 기준

- Database/Auth/Storage: Supabase
- Migration source of truth: `supabase/migrations/*.sql`
- 2026-09-17 `origin/develop` 기준 Migration 파일: 62개
- DEV 적용 자동화: `.github/workflows/ci.yml`의 `migrate-dev`
- DEV 적용 스크립트: `scripts/apply-dev-migrations.mjs`

파일 수는 참고용 스냅샷이다. 실제 작업 시 다시 계산한다.

## 2. 주요 데이터 영역

| 영역 | 대표 객체 |
| --- | --- |
| 회원·권한 | `profiles`, operator permissions, RLS |
| 상품·기수 | `courses`, `cohorts`, `cohort_sessions` |
| 학습 | `curriculum_weeks`, `curriculum_lessons`, `lesson_contents`, `enrollments`, `lesson_progress` |
| 미션·질문 | `curriculum_missions`, `mission_submissions`, `mission_quizzes`, `edu_questions` |
| 주문·결제 | `orders`, `order_items`, `payments`, `payment_events`, `refunds` |
| 쿠폰 | `coupons`, `coupon_products`, `coupon_redemptions`, `customer_coupons` |
| 콘텐츠 | `articles`, `article_categories`, `site_banners`, `review_videos`, `reviews` |
| CRM | `crm_tags`, `crm_member_tags`, `crm_templates`, `crm_campaigns`, `crm_automations` |
| 무료클래스 | `landing_configs`, `funnel_sessions`, `funnel_events`, `landing_actuals` |
| 마케팅 성과 | `landing_campaigns`, `landing_campaign_dimensions`, `landing_campaign_actuals`, `landing_campaign_meta_daily` |

## 3. 핵심 RPC·Trigger

변경 전에 최신 Migration에서 현재 정의를 확인한다.

- `create_checkout_order`
- `apply_coupon_to_order`
- `finalize_zero_total_order`
- `finalize_toss_payment`
- `finalize_toss_refund`
- `crm_sync_automatic_tags`
- `edu_publish_landing`
- `edu_ingest_landing_performance`
- `edu_upsert_campaign_actual`
- `edu_store_campaign_meta`
- `edu_marketing_dashboard`
- `edu_marketing_export`

같은 함수가 여러 Migration에서 재정의될 수 있다. 파일명 순서상 가장 최신 정의와 실제 DB 정의를 모두 확인한다.

## 4. Migration 작성 규칙

- 새 파일명: `YYYYMMDDHHMMSS_description.sql`
- 이미 적용된 파일을 편집하지 않는다.
- 기존 데이터를 보존하는 forward-only 변경으로 작성한다.
- 반복 적용 안전성보다 실제 Schema 불일치를 먼저 검증한다. `IF NOT EXISTS`로 오류를 숨기지 않는다.
- 테이블 변경 시 RLS, policy, index, FK, constraint, trigger, grant 영향을 함께 확인한다.
- security definer 함수는 `search_path`와 실행 권한을 명시적으로 검토한다.
- 결제·쿠폰·권한 함수는 멱등성과 동시 실행을 검토한다.
- 대용량 UPDATE 또는 backfill은 영향 행 수와 rollback 기준을 먼저 작성한다.

## 5. DEV 적용

GitHub Actions는 `develop` push의 전체 검증 성공 후 DEV Migration을 적용한다.

로컬에서 승인된 DEV 적용이 필요할 때만 다음을 사용한다.

```bash
SUPABASE_ACCESS_TOKEN=*** node scripts/apply-dev-migrations.mjs
```

이 스크립트는 `dev_migrations.schema_migrations`에 version과 SHA-256 checksum을 기록한다. checksum 불일치가 발생하면 기존 파일을 고치지 말고 새 Migration을 추가한다.

## 6. Production 적용

Production에는 DEV script를 사용하지 않는다. 다음 Gate를 모두 통과한 Release 작업에서만 적용한다.

1. QA_PASS Commit과 Tree 확정
2. DEV 적용 Migration과 checksum 확정
3. 운영 객체와 적용 이력 읽기 전용 확인
4. 백업 또는 복구 가능 상태 확인
5. 적용 순서 및 실패 중단 기준 작성
6. Migration 적용
7. 각 Migration 직후 검증 SQL 실행
8. 애플리케이션 배포
9. Production smoke test

운영 장애 시 검증되지 않은 역Migration을 자동 실행하지 않는다. 코드 Rollback과 DB 복구를 분리해 판단한다.

## 7. DB 변경 완료 보고

- Migration 파일명
- SHA-256 checksum
- 변경 객체
- DEV 적용 여부와 시간
- 검증 SQL 결과
- RLS·Grant·Trigger 검증
- 데이터 보존 결과
- Production 적용 여부
- rollback 기준
