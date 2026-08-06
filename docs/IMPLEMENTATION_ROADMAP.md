# 브랜디액션 에듀 운영 구현 로드맵

## 확정된 제품 구조

- 고객은 클래스를 확인하고 모집 중인 기수를 선택해 결제한다.
- 관리자는 클래스·기수·주차·Day별 커리큘럼을 관리한다.
- 커리큘럼 콘텐츠 유형은 `VOD`와 `자료`만 사용한다.
- VOD는 영상 링크, 자료는 비공개 파일 저장소에 저장한다.
- 클래스명 대신 변경되지 않는 `course_code`를 주문·수강권·고객 분석의 기준으로 사용한다.
- 결제 완료는 브라우저 성공 화면이 아니라 PG 웹훅과 서버 승인 결과로 확정한다.
- 강의 접근 권한은 결제 상태가 아니라 `active` 상태의 수강권으로 판단한다.
- 관리자 변경값은 브라우저 저장소가 아니라 Supabase DB와 Storage에 저장한다.

## 구현 순서와 완료 기준

| 단계 | 작업 | 완료 기준 |
|---:|---|---|
| 1 | 기존 소스 진단 | Vercel용 Next.js 소스와 임시 기능 목록 확인 |
| 2 | 데이터 구조 확정 | SQL 마이그레이션, RLS, Storage 정책 작성 |
| 3 | Supabase 연결 | 코드 연결 완료 · Vercel 환경변수 등록과 실서버 확인 대기 |
| 4 | 인증·권한 | 이메일·소셜 로그인 및 보호 경로 구현 완료 · 공급자 설정과 관리자 지정 대기 |
| 5 | 클래스 CMS | 클래스·기수·상세 이미지·커리큘럼·배너·리뷰가 DB에서 조회·수정됨 |
| 6 | 주문·결제 | 서버 주문 생성, 금액 검증, PG 승인·웹훅·환불 작동 |
| 7 | 수강권 | 결제 완료 시 자동 발급, 환불 시 회수, 중복 발급 차단 |
| 8 | 마이페이지·학습 | VOD·자료 접근과 학습 진도가 사용자별로 분리됨 |
| 9 | 운영 기능 | 결제 조회, 회원·수강 상태, 리뷰·감사 로그 작동 |
| 10 | 출시 검수 | 모바일·권한·중복 결제·웹훅 재시도·환불 시나리오 통과 |

## 이번 단계에서 생성하는 데이터 영역

- 계정: `profiles`
- 클래스: `courses`, `course_assets`, `cohorts`, `cohort_sessions`
- 커리큘럼: `curriculum_weeks`, `curriculum_lessons`, `lesson_contents`
- 운영 콘텐츠: `site_banners`, `reviews`, `site_settings`
- 거래: `orders`, `order_items`, `payments`, `payment_events`
- 권한: `enrollments`
- 학습: `lesson_progress`
- 운영 추적: `audit_logs`

## 환경변수 원칙

- 공개 키는 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`만 사용한다.
- `SUPABASE_SERVICE_ROLE_KEY`, PG 비밀키, 웹훅 서명키는 서버에서만 사용한다.
- 모든 비밀값은 Vercel 환경변수에 입력하고 소스·채팅·스크린샷에 남기지 않는다.
