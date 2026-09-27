# Admin 전체 UI 이행 보고 — Phase 5

> 2026-09-27 · 선행 계약: [01 감사](./01_ADMIN_AUDIT.md) → [02 디자인 시스템](./02_ADMIN_DESIGN_SYSTEM.md) → [03 공통 컴포넌트](./03_ADMIN_COMPONENTS.md) → [04 파일럿](./04_PILOT_MIGRATION.md)
> 기준 코드: Phase 4 `3f4351280ad83df0651a0a9409d5a0412494e720` · 작업 브랜치 `codex/admin-ui-full-20260927`
> **판정: UI 코드 이행과 합성 회귀 완료. 실제 운영자 계정·개발 데이터로 수행하는 UAT 전에는 전체 DONE이 아니다.** 기능 모델, API, DB, 권한, 실제 결제·환불은 변경하지 않았다.

## 1. 범위와 상태 정의

Admin은 파일별 route가 아니라 `app/admin/[[...path]]/page.tsx` 아래 클라이언트 워크스페이스가 분기한다. `lib/platform.ts`의 27개 섹션 키, 운영 홈, 2개 편집 URL이 대상이고 `/admin/metrics`는 별도 화면이 아닌 리다이렉트다. 등록과 수정은 같은 편집기에서 `?id=`로 구분한다.

상태는 `TODO`(미착수) → `IN PROGRESS`(구현 중) → `MIGRATED`(코드 전환·정적 검사 완료, 화면 검수 대기) → `QA`(합성 브라우저까지 검증, 실제 dev UAT 대기) → `DONE`(실제 권한·데이터·상태와 반응형 확인 완료)로 정의한다. 이 문서는 **합성 통과를 실제 UAT로 승격하지 않는다.**

| Page | Type | Template | Components / 이행 지점 | Status |
|---|---|---|---|---|
| `/admin` | Dashboard | DASHBOARD | `PageHeader`, compact `AdminSummaryCard`, 기존 운영 차트 | MIGRATED |
| `/admin/conversion` | Operation | OPERATION | 기존 공통 Header·Filter·Drawer, 운영 고유 퍼널 | MIGRATED |
| `/admin/products` | List / Table | LIST | 파일럿 `FilterBar`, `DataTable`, Badge, Pagination | QA |
| `/admin/product-editor` | Create | FORM | 파일럿 공통 Form·Button·Section | QA |
| `/admin/product-editor?id=…` | Edit | FORM | 동일 편집기, 기존 값·저장/미리보기 보존 | QA |
| `/admin/cohorts` | List / Table | LIST | 공통 Catalog toolbar/table/status/action; 기수 전용 운영 도구 유지 | MIGRATED |
| `/admin/weeks` | List / Table | LIST | 공통 Catalog toolbar/table, 주차 그룹, 이동 버튼 | QA |
| `/admin/learning` | List / Table | LIST | 공통 Catalog 필터·표·상태·요약 | MIGRATED |
| `/admin/learning-editor` | Create | FORM | `PageHeader`, `AdminFormField`, Button, Empty | MIGRATED |
| `/admin/learning-editor?id=…` | Edit | FORM | 동일 편집기, 본문·퀴즈 저장 경계 유지 | MIGRATED |
| `/admin/contents` | List / Table | LIST | 공통 Catalog 표·행 액션·Empty | MIGRATED |
| `/admin/missions` | Operation | OPERATION | 상품/주차/보관 그룹 유지, 공통 필터·상태·액션·표 | MIGRATED |
| `/admin/members` | Operation | OPERATION | 파일럿 FilterBar·Summary·QuickFilter·DataTable·Drawer | QA |
| `/admin/reviews` | Operation | OPERATION | 공통 FilterBar·QuickFilter·Badge·Empty·결정 액션, 검토 상세 유지 | QA |
| `/admin/questions` | Operation | OPERATION | 공통 Catalog 필터·표·상태·답변 액션 | MIGRATED |
| `/admin/customers` | List / Table | LIST | 공통 Catalog 필터·표·요약, 회원 기록 Badge·Pagination | MIGRATED |
| `/admin/staff` | Settings | SETTINGS | 공통 `AdminFormField`, Button·Status, 권한 범위 편집 유지 | MIGRATED |
| `/admin/tags` | List / Table | LIST | 공통 Catalog 표·상태·편집 액션 | MIGRATED |
| `/admin/coupons` | List / Table | LIST | 공통 Catalog 요약·표, 공통 편집 창 액션 | MIGRATED |
| `/admin/product-reviews` | Operation | OPERATION | 공통 Catalog 필터·표·상태·대표 노출 액션 | MIGRATED |
| `/admin/banners` | List / Table | LIST | 공통 Catalog 표·순서·상태, 편집 창 공통 액션 | MIGRATED |
| `/admin/articles` | List / Table | LIST/FORM | 공통 Catalog·QuickFilter·카테고리 DataTable·무료강의 Form | QA |
| `/admin/testimonials` | List / Table | LIST | 공통 Catalog 표·상태·행 액션 | MIGRATED |
| `/admin/orders` | Operation | OPERATION | 파일럿 기간 필터·요약·예외 QuickFilter·표·Drawer | QA |
| `/admin/landing` | Dashboard | DASHBOARD | 기존 공통 Header·Form·Badge·Drawer, 성과 고유 차트 | MIGRATED |
| `/admin/analytics` | Dashboard | DASHBOARD | 공통 날짜 FilterBar·Summary·DataTable·Error/Empty | MIGRATED |
| `/admin/metrics` | Settings alias | — | `/admin/landing` 리다이렉트; 독립 화면 없음 | QA |
| `/admin/campaigns` | Operation | OPERATION | CRM 목록 DataTable·Badge·행 편집, 기존 발송 폼 | QA |
| `/admin/templates` | List / Table | LIST/FORM | CRM 목록 DataTable·Badge·행 편집, 기존 템플릿 폼 | QA |
| `/admin/automations` | Operation | OPERATION | CRM 목록 DataTable·Badge·행 편집, 기존 조건 폼 | QA |
| `/admin/seo` | Settings | SETTINGS | 공통 Form·코드 DataTable·Drawer·Button | QA |
| `/admin/settings` | Settings | SETTINGS | 공통 Form·실측 DataTable·Drawer·Button | QA |

`MIGRATED` 행은 실제 데이터/권한이 연결된 브라우저 화면 검수 전이다. `QA` 행도 메모리 기반 fixture 또는 제한된 UI 검증까지만 통과했다. `DONE`을 기록한 페이지는 없다. 따라서 이 표는 **전체 코드 대상 누락 방지 매트릭스**이지 운영 승인서가 아니다.

## 2. 유형별 적용과 유지한 계약

1. **List / Table:** `AdminCatalog`의 공통 경로를 `AdminDataTable`·`AdminFilterBar`·`AdminSelect`·`AdminSearchField`·`AdminStatusBadge`·`AdminButton`으로 통일했다. 아티클 카테고리도 행별 카드 대신 공통 표로 전환했다. 주차 그룹, 서버 페이지네이션, 현재 페이지 검색·CSV 범위, 선택·보관·복구·순서 이동은 기존 동작을 유지했다.
2. **Operation:** 미션 상품/주차 계층과 보관 복구, 제출물 검토 큐, 주문 예외 큐, 회원 미션 표, CRM 발송 폼의 도메인 동선을 표 하나로 강제하지 않았다. 공통 상태·필터·버튼·Drawer 계약만 확장했다.
3. **CRUD / Form:** 공통 편집 창의 저장·닫기·보관·회원 삭제 액션과 상태 배지, 학습 편집기, 아티클 상단 설정·카테고리 폼, 직원/CRM/설정 필드를 공통 규격으로 맞췄다. HTML/블록/퀴즈/쿠폰/태그의 복잡한 필드와 기존 검증 로직은 그대로 유지했다. 저장이 필요한 아티클 노출 설정은 즉시 반영을 뜻하는 Switch가 아니라 Checkbox다.
4. **Dashboard / Settings:** 운영 홈/목록 KPI의 compact 요약과 analytics 기간 필터·결과 표, SEO/운영 설정의 기록 표와 추가 코드 Drawer를 공통화했다.

새 styling library를 추가하지 않았다. `features/admin-ui/styles/admin-system.css`의 `.edu-admin` 범위에 Phase 2의 역할 토큰·컴포넌트 조합만 추가했고 고객 화면 스타일에는 적용하지 않았다. 공통 `AdminFormField`는 기존 복잡한 폼 컨트롤을 데이터/핸들러 변경 없이 감싸는 용도이고 `AdminLinkButton`은 이동 액션에 같은 버튼 위계를 적용한다.

## 3. 회귀와 시각 QA

| 항목 | 결과 / 경계 |
|---|---|
| 타입·빌드 | `npx tsc --noEmit --incremental false`, `npm run build` 통과. Next.js 16.3.5 webpack 빌드에서 48개 static page 생성 |
| 단위/계약 | `npm test` **451/451 통과**. API 권한·주차 이동·미션 상품 범위·결제/환불 안전 테스트 포함하나 실제 외부 처리는 하지 않음 |
| 합성 브라우저 | `npx playwright test` **324 PASS · viewport 비대상 3 SKIP · 0 FAIL** (desktop/tablet/mobile, 총 327건). 파일럿·주차·CRM/설정 Drawer·아티클·제출 검토·회원 기록 포함. 이전 `상품명 *`/`다음 기록` 선택자 2종은 공통 컴포넌트의 현재 접근성 이름으로 갱신 후 전체 재통과 |
| 정적 스타일 | 변경 TSX ESLint 오류 0. 기존 `<img>` 최적화 경고 4건 유지. `git diff --check` 통과 |
| 시각 | 로컬 fixture에서 CRM 등록 폼과 아티클 카테고리 표/무료강의 폼의 필드·상태·버튼 렌더링 확인. 실제 Admin 데이터와 전체 32경로 화면 캡처 대조는 미수행 |
| 기능 보호 | 목록 핸들러·필터 범위·서버 페이지·상품/미션/검토 저장 요청·권한 API를 변경하지 않음. 합성 fixture는 외부 쓰기 없음 |

기본·hover·focus·disabled·loading·error·empty는 공통 컴포넌트 fixture에서 확인했다. 경로별 **정상 데이터, 빈 목록, 검색 결과 없음, 오류, 저장 성공/실패**는 실제 dev 계정·권한·데이터 조합으로 다시 확인해야 한다. 데스크톱 1440px, 태블릿 834px, 모바일 390px 합성 브라우저를 사용했지만 전체 Admin 실데이터의 긴 제목/주소/금액/국문 줄바꿈, 업로드 모달, 차트와 프린트는 아직 UAT 범위다.

## 4. Legacy CSS 및 삭제 판단

`app/ui/final/admin.css`는 생성 산출물이므로 직접 수정하지 않았다. 기존 `.btn`, `.field`, `.badge`, `.panel`, `.dialog-*`는 아직 **공개 화면, 고유 편집기, 미이행 보조 컨트롤에서 참조된다.** `rg`로 실제 참조를 확인했으며 사용처를 전부 없애기 전 삭제하지 않는다. 중복 선언을 전역에서 성급히 제거하면 공개 화면과 복잡한 폼이 손상될 수 있다. Phase 5의 마지막 정리 게이트는 실제 경로별 QA 후 참조를 재계수하고, 삭제 후보를 한 번에 diff·빌드·브라우저 회귀로 검증하는 것이다. 현재 삭제 없음.

## 5. 미완료 게이트와 릴리스 판단

- 실제 운영자 역할별 dev 읽기 검수: 회원/상품/클래스/기수/미션/제출물/주문/환불/쿠폰/리뷰/배너/아티클/마케팅/관리자/설정의 32행을 페이지별 정상·빈·오류·검색 결과 없음과 권한으로 대조한다. 주문·환불·실수강권은 **읽기 전용**으로 검증하고 실제 처리 API를 호출하지 않는다.
- Tablet/Mobile에서 각 목록 overflow, 필터 줄바꿈, 긴 폼, 모달/Drawer 초점·닫기·복귀를 실제 데이터로 확인한다.
- 서버 총건수 대 현재 페이지 검색·quick filter 범위, 회원 서버 50건 묶음과 집계 범위는 Phase 4에서 알려진 계약 차이이다. UI 통일만으로 데이터 정의가 바뀌었다고 표시하지 않는다.
- 공통 컴포넌트 적용 뒤 남은 legacy CSS는 위 UAT 및 참조 증명이 끝난 뒤에만 삭제한다.
- push·PR·Preview·`develop` 병합·dev 기본 주소 배포·운영 배포는 이번 요청에서 실행 승인되지 않았다. 로컬 검증 이후 별도 대상/커밋 기준 승인 필요.

**결론:** 코드 이행 범위는 전체 Admin route에 닿았지만, 실제 환경의 전 경로 functional/responsive/state QA와 legacy 사용처 최종 확인 전에는 Phase 5 전체 완료 또는 운영 배포 가능으로 판정하지 않는다.
