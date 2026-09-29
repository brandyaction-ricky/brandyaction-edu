# Admin UI/UX Audit — Phase 1

> 조사일: 2026-09-27 · 기준: PR #202 Preview와 동일한 `4d92cdc8c51245f3b2cd42908b0dea07dd9d1aa0` 소스 스냅샷 · 작업 브랜치: `codex/admin-ui-audit-20260927`
> 범위: `/admin` 화면의 소스 기반 구조·UI 패턴 감사. 데이터·권한·업무 로직의 정상 동작을 확정하는 QA가 아니다. Phase 1에서는 이 문서 외 코드·컴포넌트·CSS·화면을 변경하지 않는다.

## 1. 현재 구조와 조사 방법

- Next.js App Router의 `app/admin/[[...path]]/page.tsx`가 세그먼트를 검증하지만, 실제 화면은 `app/admin/layout.tsx` → `app/ui/admin-workspace.tsx` → `app/ui/platform.tsx`의 클라이언트 워크스페이스에서 분기한다. `lib/platform.ts`에 27개 섹션 정의가 있다. 따라서 파일 기반 route 수만 세면 Admin 전체를 놓친다.
- `/admin/metrics`는 별도 화면이 아니라 `metricsRedirect`로 이동한다. 상품·학습 편집기는 각각 `/admin/product-editor`, `/admin/learning-editor`에서 `?id=` 유무에 따라 등록/수정 맥락이 갈린다.
- 공통 셸·내비게이션은 `features/admin-ui/`로 옮겨졌지만 목록/업무 화면 상당수는 `app/ui/final/`과 `app/ui/admin-workflows.tsx`의 이전 패턴을 사용한다. `features/admin-ui/components/admin-system.tsx`와 `app/ui/final/admin-system.tsx`에는 같은 이름의 컴포넌트 구현이 병존한다.
- 근거는 위 스냅샷의 route registry, 컴포넌트, CSS, 필터/테이블 렌더링 소스다. Preview 전체 라우트의 로그인·권한별 실측, 해상도별 시각 검수, 스크린리더 검수, API/DB 검증은 수행하지 않았다. 아래 문제는 코드에서 확인되는 UI/정보 범위에 한정하고, 실행 시 영향은 후속 QA로 확인해야 한다.

## 2. Admin Route Map

유형은 주된 업무 기준이다. 목록 화면 내부의 등록/수정 팝업은 별도 URL이 아니므로 목록의 부가 동작으로 적었다. 개선 필요도는 이 감사의 디자인/운영 UX 우선순위이며 결함 확정 등급이 아니다.

| Route | 화면 | 유형 | 주요 기능 | 개선 필요도 |
|---|---|---|---|---|
| `/admin` | 운영 홈 | Dashboard | 핵심 지표·운영 작업 진입 | P2 |
| `/admin/conversion` | 모집 운영 | Operation | 문의/구매 연결·검토·후속 안내 | P2 |
| `/admin/products` | 상품 관리 | List / Table | 상품 검색·상태·판매 점검·편집 진입 | P2 |
| `/admin/product-editor` | 상품 등록 | Create | 기본/상세/커리큘럼 등 상품 구성 | P2 |
| `/admin/product-editor?id=…` | 상품 수정 | Edit | 기존 상품·커리큘럼 편집 | P2 |
| `/admin/cohorts` | 기수·회차 관리 | List / Table | 기수 목록·일정·상태·등록/수정 | P2 |
| `/admin/weeks` | 주차 구성 | List / Table | 주차별 그룹·순서 이동·등록/수정 | P2 |
| `/admin/learning` | 학습 콘텐츠 관리 | List / Table | 상품/주차 탐색·학습 목록·편집 진입 | P1 |
| `/admin/learning-editor` | 학습 콘텐츠 등록 | Create | 학습 본문·자료·퀴즈 구성 | P2 |
| `/admin/learning-editor?id=…` | 학습 콘텐츠 수정 | Edit | 기존 학습 본문·퀴즈 편집 | P2 |
| `/admin/contents` | 영상·자료 관리 | List / Table | 학습별 자산 등록/수정 | P2 |
| `/admin/missions` | 미션 관리 | Operation | 상품/주차/상태별 미션·보관·퀴즈 | P1 |
| `/admin/members` | 회원 미션관리 | Operation | 기수/주차별 회원 제출·검토 현황 | P1 |
| `/admin/reviews` | 제출물 검토 | Operation | 제출 큐·결정·피드백 | P1 |
| `/admin/questions` | 질문함 | Operation | 질문 목록·답변·보관 | P2 |
| `/admin/customers` | 회원 관리 | List / Table | 회원 검색·수강권/태그·상세 | P1 |
| `/admin/staff` | 스태프 권한 | Settings | 스태프 접근 범위 관리 | P2 |
| `/admin/tags` | 고객 태그 관리 | List / Table | 자동/수동 태그·규칙 | P2 |
| `/admin/coupons` | 쿠폰 관리 | List / Table | 쿠폰 발급 조건·상태·기간 | P1 |
| `/admin/product-reviews` | 상품 후기 관리 | Operation | 상품 후기 공개·대표 노출 | P2 |
| `/admin/banners` | 메인 배너 관리 | List / Table | 문구·이미지·CTA·순서·기간 | P2 |
| `/admin/articles` | 아티클 관리 | List / Table | 글/영상 콘텐츠·발행 상태 | P2 |
| `/admin/testimonials` | 고객 후기 관리 | List / Table | 홈페이지 고객 사례·영상 | P2 |
| `/admin/orders` | 주문 결제 | Operation | 기간별 주문·결제·환불·수강권 확인 | P1 |
| `/admin/landing` | 광고·웨비나 성과 | Dashboard | 무료클래스 성과·캠페인 설정 | P2 |
| `/admin/analytics` | 전체 유입 성과 | Dashboard | 유입/행동 지표·기간 분석 | P2 |
| `/admin/metrics` | 실측 데이터 관리(이전 경로) | Settings | `/admin/landing` 계열로 리다이렉트 | P3 |
| `/admin/campaigns` | 캠페인 발송 | Operation | 대상·발송 결과 관리 | P2 |
| `/admin/templates` | 메시지 템플릿 | List / Table | 반복 안내 문구 관리 | P2 |
| `/admin/automations` | 자동 메시지 | Operation | 조건·사용 상태·실행 결과 | P2 |
| `/admin/seo` | 검색코드 설정 | Settings | 검색 노출/측정 코드 | P2 |
| `/admin/settings` | 운영·트래킹 설정 | Settings | 운영 규칙·광고 설정 | P2 |

즉, 27개 섹션 키 + 홈 + 편집기 2개 URL이다. 위 표는 편집기의 등록/수정 맥락을 별도 행으로 표시해 32행이다. `metrics`는 사용자에게 독립 관리 화면으로 제시하지 않는다. 근거: `lib/platform.ts`, `lib/admin-route.ts`, `app/admin/[[...path]]/page.tsx`, `app/ui/platform.tsx`.

## 3. IA / Navigation

현재 사이드바는 **운영 홈 → 클래스 관리(9) → 고객 관리(4) → 콘텐츠 관리(3) → 주문·매출(1) → 마케팅·전환(8) → 추가 운영 도구(스태프)** 순이다. 큰 메뉴는 접이식 그룹 아래 1단계 링크이며, 편집기에서는 부모 메뉴를 현재 위치로 강조한다. `aria-current="page"`, topbar breadcrumb, 모바일 메뉴의 포커스 순환/복귀가 구현되어 있다. 메뉴 노출은 `features/admin-ui/permissions/menu-visibility.ts`를 따른다.

| 관찰 | 영향 / 권장 확인 |
|---|---|
| `lib/platform.ts`의 섹션 `title/group`, `features/admin-ui/navigation/admin-navigation.ts`의 표시명·그룹, 이전 `app/ui/final/admin-shell.tsx`의 명칭이 병존 | 새 화면 추가·명칭 변경 시 메뉴/헤더/설명 간 드리프트 가능. Phase 2에서 단일 메타데이터 소유자와 호환 계층을 정한다. |
| `members`(회원 미션)와 `customers`(회원 관리)가 서로 다른 그룹이고 `reviews`/`questions`는 클래스 그룹 | 회원 중심 검토 업무에서 여러 그룹을 왕복한다. 업무 흐름 기준 교차 링크와 breadcrumb를 사용자 테스트한다. |
| `product-reviews`(상품 후기)와 `testimonials`(고객 후기)의 유사한 이름·다른 노출 목적 | 현재 상품 후기 화면에 구분 설명은 있으나 메뉴만으로는 구분이 어렵다. 사이드바 명칭/보조 설명 검토. |
| `landing`, `analytics`, `conversion`, `campaigns`, `settings`가 하나의 마케팅 그룹에 혼재 | 성과 확인과 운영 설정의 밀도가 높다. 그룹 2단 분리 여부를 정보 탐색 테스트 후 결정. |
| `staff`만 “추가 운영 도구”, `metrics`는 숨겨진 redirect | 권한 관리의 위치와 이전 링크의 안내 문구를 정리할 필요. 즉시 URL 변경은 하지 않는다. |

근거: `features/admin-ui/navigation/admin-navigation.ts`, `features/admin-ui/layouts/admin-shell.tsx`, `app/ui/final/admin-shell.tsx`.

## 4. Page Layout Audit

공통 셸의 콘텐츠 최대폭은 **wide 1440px / standard 1280px / narrow 960px**이고 기본 gutter는 **32px**, 반응형에서 24/16px으로 줄어든다. Topbar는 64px, 사이드바는 224px. 폭은 `adminContentWidth()`가 URL별로 결정한다. 다만 페이지 내부는 다음 패턴이 공존한다.

| 화면군 / 해당 route | 폭·Header·Section | 필터·액션·본문·페이지네이션의 현재 패턴 | 차이 / 위험 |
|---|---|---|---|
| 범용 목록: products, cohorts, weeks, contents, customers, tags, coupons, product-reviews, banners, articles, testimonials | 셸 폭 + 기존 `AdminHeading`/`.page-head`; KPI는 일부 화면만 | `.filter-row` + `AdminSearchField` + 개별 `<select>` → `.panel/.table-scroll` → `AdminPagination`; 등록 버튼은 제목 우측, 행 수정은 테이블 우측 | 폭·상단 KPI·상품 scope 유무가 다르고 toolbar 순서도 다름. 일부 검색은 로드된 페이지 안에서만 적용. |
| 학습·미션·질문: learning, missions, questions | 같은 제목 패턴이나 목록은 별도 배치 | 학습은 주차 aside+카드; 미션은 상태 탭+상품/주차 그룹·카드; 질문은 질문 카드/답변 | 표 중심 목록과 정보 밀도·상태 위치·필터 배치가 다름. “테이블화”가 항상 정답인지는 업무 시험 필요. |
| 회원 미션: members | wide; 설명 다음 toolbar·context·compact summary | 복합 toolbar → quick filter → 자체 table → 자체 페이지네이션 → 우측 자체 drawer | 공통 `AdminDataTable/AdminDrawer`와 구조·CSS가 다름. 서버 50명 묶음과 로컬 20/50명 페이지가 이중 존재. |
| 제출 검토·주문: reviews, orders | wide; 검토는 queue/detail, 주문은 기간 패널+KPI+별도 목록 panel | 검토는 상태/정렬/검색과 상세; 주문은 날짜 적용 후 검색/상품/상태와 테이블·자체 dialog | 날짜 필터와 목록 필터가 떨어져 있음. 상세 overlay/CTA 패턴이 상이. |
| 성과/전환: conversion, landing, analytics | wide; `AdminPageHeader`는 conversion/landing, analytics는 workflow 중심 | 기간·캠페인·지표 필터, 별도 차트/표/설정 drawer | 새 시스템과 화면 전용 tracking CSS가 함께 사용됨. |
| CRM/설정: templates, campaigns, automations, seo, settings, staff | standard 또는 narrow | 자체 폼·탭·목록·상태 메시지 | Create/Edit 액션, 검증 메시지, 넓이의 공통 규칙이 약함. |
| 편집기: product-editor, learning-editor | standard; editor 탭과 작업 패널 | 탭/폼/콘텐츠 목록; 저장·미리보기·돌아가기 | 동일 셸 안에서도 목록의 toolbar/table 원칙과 다른 별도 편집 작업 흐름이므로 공통화 범위를 분리해야 함. |

테이블 wrapper는 두 계열이다. `AdminDataTable`은 caption·스크롤 힌트·focusable region을 제공하지만 범용 목록은 `.table-scroll.mobile-cards.admin-legacy-table`을 직접 쓴다. 전역 `.edu-admin table/th/td` 규칙과 새 `.admin-data-table` 규칙이 함께 적용되어 cascade 확인이 필요하다. 근거: `features/admin-ui/styles/admin-system.css`, `app/ui/final/admin.css`, `app/ui/final/admin-catalog.tsx`, `app/ui/admin-workflows.tsx`.

## 5. Component Inventory

| 구성 요소 | 주요 위치·현재 구현/variant | 중복·스타일 차이 |
|---|---|---|
| Button | `AdminButton`(primary/secondary/tertiary/destructive, sm/md), 기존 `.btn`/`.title-btn` | 높이·padding·주 액션 표현이 화면별로 다름. |
| Input / Search | `AdminInput`, `AdminSearchField`; workflow의 raw `input`, 기존 `.search` | 검색 아이콘/폭/label·즉시 검색과 기간 적용형 검색이 섞임. |
| Select | `AdminSelect`, 목록·업무 화면 raw `<select>` | label이 위/안/aria-only로 다르며 일부는 38px, 공통은 40px. |
| Checkbox / Radio / Switch | `AdminCheckbox`; raw checkbox/radio(퀴즈·필터). 독립 공통 `AdminSwitch`는 확인되지 않음 | 체크형 상태 전환과 필터 체크의 규격이 다름. switch 의미가 필요한 곳은 별도 조사. |
| DatePicker | `AdminDatePicker`(date 기반), 날짜/시간 raw input, 주문의 기간 필터 | 포맷·Apply/Reset·레이블 위치를 통일하지 않음. |
| Card / Summary | `AdminMetric`, 이전 `Metric`/`.metric`, `.panel`, tracking 카드 | 큰 KPI/compact summary 혼재. |
| Table | `AdminDataTable`과 기존 table, 회원 전용 table, tracking table | caption·sticky·행 높이·정렬/페이지네이션/빈 상태 보증이 서로 다름. |
| Badge / Status | `AdminStatusBadge` 5 tone, `primitives.tsx`의 `Badge`, `.participant-state-badge`, `.status-cell` | 같은 상태의 명칭/색/모서리·크기가 다름(§8). |
| Tabs | 이전 `.tabs/.tab`, 미션 상태 탭, 편집기 탭, quick filter | 선택 표시·키보드 역할·count 배치가 다름. |
| Modal / Drawer | `AdminModal/AdminDrawer/AdminConfirmDialog`, 회원 전용 aside drawer, 주문 자체 dialog | 공통 dialog는 focus trap/복귀 제공; 자체 구현은 동일 동작 회귀 검증 필요. |
| Pagination | `AdminPagination`, 회원 자체 이전/다음+page-size, 일부 목록 footer | 표시 총계의 기준과 위치가 다름. |
| Toast / Error | `AdminToast`, workflow `Status` notice, `.notice`, inline error | 저장 성공/실패의 수명·위치·aria-role이 상이. |
| Tooltip | 주로 `title` 속성(회원 활동 등) | 일관된 시각 tooltip 컴포넌트는 확인되지 않음. 단, 아이콘 버튼 `title`은 사용. |
| Empty / Loading | `AdminEmptyState/AdminSkeleton/AdminLoadingState`, 이전 `Empty`, 회원 자체 skeleton | 안내 문구·해결 CTA·로딩 크기가 다름. |

위치는 `features/admin-ui/components/admin-system.tsx`, `app/ui/final/primitives.tsx`, `app/ui/final/admin-system.tsx`, `app/ui/final/admin-catalog.tsx`, `app/ui/admin-workflows.tsx`, `app/ui/landing/admin.tsx`에서 확인했다. 후보를 새로 구현하자는 뜻이 아니라, 현재 기능을 잃지 않는 통합 후보를 표시한 것이다.

## 6. CSS Inventory / Styling Architecture

- `app/layout.tsx`가 `tokens.css`, `frontend.css`, `admin.css`, `features/admin-ui/styles/admin-system.css`, `integration.css`, 편집기 CSS 등을 순서대로 전역 import한다. Admin 대부분은 `.edu-admin` 아래의 전역 CSS 셀렉터다. CSS Module이나 styled-components 사용은 이번 Admin 경로에서 확인되지 않았다. Tailwind v4 의존성은 있으나 Admin의 주된 스타일 적용은 utility class가 아닌 전역 CSS다. 동적 태그 색, 차트/진도 등의 일부 inline style이 있다.
- 토큰(`tokens.css`): control 48px, button 44px, table row 64px, page gutter 32px, radius 4/8/12px 계열. 새 Admin 시스템(`admin-system.css`): control 40px / small 36px, table row/header 44px, radius 6/8px, gutter 32/24/16px. 이전 `admin.css`의 raw input은 min-height 38px이다. 이 값들은 전역/컨텍스트별 의도된 차이일 수도 있지만, 동일 계층 컨트롤에서는 혼용된다.
- 반복값 표본(세 파일 `admin.css`, `admin-system.css`, `tracking-admin.css`의 텍스트 선언 기준, 최종 computed style 빈도 아님): radius는 `var(--radius-sm)`/`var(--radius-md)`와 `var(--admin-radius-control)`/`var(--admin-radius-surface)` 및 4/6/8/12px 직접값이 병존. 컨트롤 높이는 36/38/40/44/48px, 간격은 8/12/16/20/24/32px이 반복. 직접 색상 예시는 `#e5e5e5`, `#fafbfc`, `#f5f6f8`, `#f2f3f5`, `#fff`이며 토큰 `--admin-border: #e2e5e9`와 병용한다.
- `integration.css`가 Admin 특수 화면 규칙도 포함해 cascade 결합도가 높다. 전역 `table/th/td`, `.filter-row`, `.badge`와 신규 `.admin-*` 사이 우선순위가 페이지 추가 시 스타일 회귀 지점이다. Phase 2에서 우선 실제 computed style 캡처와 selector 영향 범위를 확인해야 한다.

## 7. Table Audit

| 화면/구현 | Header·Row·Padding·Hover / Action | 정렬·검색·필터·Pagination | Empty / Loading / 상태 |
|---|---|---|---|
| 범용 `AdminCatalog`: products, cohorts, contents, customers, tags, coupons, product-reviews, banners, articles, testimonials | 이전 전역 table 스타일: 연한 header, 가로 divider, hover; 제목 클릭·우측 수정/관리 | 화면별 select/검색; 대부분 정렬 UI 없음. 서버 페이지가 있으면 `AdminPagination`; 검색은 이미 받은 `rows`에 로컬 적용 | 이전 `Empty`/outer loading, `Badge` 색 분기. `products`/`coupons` 일부 KPI는 서버 total과 현재 rows가 혼합됨. |
| weeks | 위와 동일 + 주차 카테고리 row; 순서 위/아래 버튼 | 상품·상태·검색, 제한 조건에서만 순서 이동; 같은 pagination | 그룹 row와 실제 row 배경 구별. 키보드/스크롤 시 그룹 맥락 유지 여부 확인 필요. |
| learning / missions / questions | 학습 카드+aside / 상품·주차 묶음 카드 / 질문 카드로 표가 아님 | 상품·주차·상태/검색 등 위치·단위 상이 | 카드의 Empty/Loading 및 상태 표현이 범용 표와 다름. 데이터 성격상 테이블 변환은 후속 사용자 검증 대상. |
| members | 전용 sticky header·compact row·hover·행 전체 클릭·상태 badge·우측 CTA | 정렬 4종, 서버 50명 단위 + 로컬 20/50명 선택, quick filter/검색 | 전용 skeleton/empty, 전용 상태 badge. quick count는 현재 내려온 `list` 기준. |
| orders | 기존 `.panel` table; 주문 상세를 자체 dialog로 표시 | 주문일 기간 Apply/전체 기간 + 별도 상품/상태/검색, `AdminPagination` | 결제 상태는 `AdminStatusBadge`, 화면 일부는 별도 KPI/notice. |
| reviews | 큐/상세 2-pane(전형적 표 아님) | 상태 탭·정렬·검색·현재 선택 | 검토 대기 업무에는 빠른 상세가 강점; 테이블 공통화 시 유지할 UX 확인. |
| landing / analytics / conversion | 새 시스템의 표 또는 tracking/업무 전용 표·카드 혼합 | 기간 preset/비교/캠페인·전환 상태 등 도메인 필터 | 새 badge/Toast/Drawer 사용 비율이 높지만 추적 화면 전용 스타일도 큼. |
| seo / settings / staff / CRM | 설정 표 또는 폼/카드 | 섹션별 자체 검색/탭/저장 동선 | 페이지별 no-data/성공·실패 표현 상이. |

공통 `AdminDataTable`은 sticky 여부, 가로 스크롤, caption, focusable region을 제공하지만 다수 화면은 직접 `<table>`을 구성한다. 모든 표에 동일한 정렬/행 클릭을 적용하기보다 읽기/편집/검토의 업무 차이를 명시해야 한다.

## 8. Filter Audit

| 화면군 | 검색 위치/범위 | Select·기간·상태·Quick Filter | Reset / Apply |
|---|---|---|---|
| 범용 목록 | 대개 toolbar 안 `AdminSearchField`; `AdminCatalog`의 `filtered = rows.filter(...)`는 **현재 로드한 페이지** 대상 | 상품, 타입, 공개/상태가 화면별로 다르고 learning/missions/cohorts 상품 scope는 toolbar 밖 | 검색은 즉시, 목록 공통 전체 초기화 동선은 없음. |
| missions | 상품 → 주차 scope + 공개/비공개/보관 탭; 검색 별도 | 상품별·주차별 그룹 버튼과 상태 탭이 한 화면에 함께 있음 | 범위 변경 시 선택 상태 일부 리셋. |
| members | 단일 7-control toolbar, 검색은 이름/이메일 | 기수·주차·미션·상태·레벨·3일 비활동 + quick filter | 서버 필터와 현재 50명 로컬 필터가 혼합; quick count는 현재 조회 기준이라고 표기. |
| orders | 목록 toolbar에 검색/상품/상태 | 주문일 시작/종료는 상단 독립 패널 | 기간은 조회/전체 기간 버튼, 나머지는 즉시 적용. 사용자에게 적용 범위가 다르게 느껴질 수 있음. |
| reviews | 큐 상단 검색/상태/정렬 | 검토 상태 탭 | 즉시 적용 중심. |
| landing/analytics/conversion | 캠페인·기간·비교·전환 상태 등 도메인별 구성 | 기간 preset, 날짜 직접 입력, 캠페인 multi-select/필터 | 데이터 재조회 버튼/수정 이탈 경고 등 화면별 차이 있음. |
| CRM/설정 | 목록·폼 탭별로 상이 | 사용 상태, 대상/권한, 설정 유형 | 저장 버튼/상태 메시지 위치가 다름. |

가장 중요한 범위 혼동은 “전체 DB”와 “현재 서버 페이지” 및 “현재 화면 로컬 필터”의 혼합이다. 특히 `AdminCatalog` 검색과 members 요약/quick count는 UI 문구에 일부 설명이 있지만, 필터 후 결과 수와 내보내기 범위를 같이 검증해야 한다.

## 9. Status Audit

| 도메인 / 예시 | 현재 표시 방식·색 | 불일치 / 확인점 |
|---|---|---|
| 공통 `published/hidden/archived`, `active/inactive` | `AdminStatusBadge`: success 녹색, neutral 회색. 범용 목록 `Badge`: green 또는 기본 회색, 작은 사각형 | 동일 상태라도 badge의 형태·문구(`공개`/`판매 중`, `숨김`/`비공개`)가 화면별로 다름. |
| 결제 `paid/pending/payment_failed/partially_refunded/refunded/cancelled` | 주문은 `AdminStatusBadge` success/warning/danger/neutral; `lib/platform.ts` 라벨 매핑 | 주문 KPI/상태 필터/행 badge 간 같은 이벤트 정의인지 QA 필요. |
| 제출 `submitted/approved/changes_requested/rejected` | 공통 badge는 warning/success/warning/danger. 이전 `.status-cell`: 승인 `#eaf5ee`, 대기 `#fff3dd`, 보완 `#fff0ef` | 공통/기존 상태 색과 셀 아이콘 규칙이 분리됨. |
| 회원 미션 `review/missing/followup/submitted/progress/done/unconfigured` | `.participant-state-badge`: 검토 빨강 `#fff0f1/#a71922`, 보완 노랑 `#fff6df/#865600`, 진행 파랑 `#edf3f9/#315e8b`, 완료 초록 `#eaf5ef/#176345`, 나머지 회색 | 공통 `submitted=warning`과 회원 화면의 `submitted=blue`가 다르고, `review`는 공통 키가 없음. |
| 질문 `open/answered`, 모집 `upcoming/recruiting/in_progress/completed`, 계정 `suspended` | 공통 badge에서는 warning/success/info/neutral. 범용 목록은 `labels`와 `Badge` 색 조건 | 라벨·색이 도메인별 상태 의미를 충분히 구분하는지 확인. |
| 쿠폰·배너 파생 상태 | `AdminCatalog`가 기간/활성 값을 계산하고 페이지별 문구(`발급 중`, `예약`, `노출 종료`)를 별도 생성 | 공유 상태 컴포넌트에 없는 `expired` 등은 기본색으로 떨어질 수 있음. |

근거: `features/admin-ui/components/admin-system.tsx`의 `STATUS`, `lib/platform.ts`의 `labels`, `app/ui/final/admin-catalog.tsx`의 `statusLabel/getStatus/badge`, `app/ui/final/admin.css`, `app/ui/final/integration.css`.

## 10. UX 문제·중복 구현과 우선순위

| 우선순위 | 확인된 현상 | 근거 / Phase 2 검증·방향 |
|---|---|---|
| P0 | **이번 정적 UI 감사에서 확정한 P0 없음** | 실데이터 누락·권한 오작동·기능 결함은 이 감사로 단정하지 않는다. QA에서 확인 시 별도 P0로 승격. |
| P1 | 범용 목록 검색/상태 필터가 내려받은 `rows`에 적용되어 서버 전체 검색처럼 오인될 수 있음 | `admin-catalog.tsx`의 `filtered = rows.filter(...)`와 서버 `pagination.total` 병존. 페이지 범위 명시, 서버 쿼리 지원 여부, export 범위를 함께 테스트. |
| P1 | 회원 미션 `전체 회원`은 서버 `stats`/`result.total`, 제출·검토·미제출은 현재 `list`에서 계산 | `admin-workflows.tsx` Participants. “현재 조회” 표기는 있으나 한 summary 안에 다른 분모가 있음. 전역/페이지 범위를 명시·분리. |
| P1 | 주문 기간 Apply와 상품/상태/검색 즉시 필터가 다른 위치·적용 범위를 가짐 | OrdersPanel. 관리자에게 현재 결과/집계의 조건을 고정 표시하고 필터 리셋 모델을 결정. |
| P1 | 미션/학습/질문 정보 구조가 고유 카드형이라 범용 목록과 탐색·상태 확인 방식이 달라짐 | 카드 자체의 장단점을 실제 미션 수·작업 빈도에 따라 테스트하고, 동일 UI 강제 전에 그룹·필터·CTA 위계를 정리. |
| P2 | Admin 시스템 컴포넌트와 이전 `app/ui/final/admin-system.tsx`, `primitives.tsx`, 로컬 form/table/drawer가 병존 | API/기능 비교표와 시각 회귀 기준을 먼저 만든 후 점진적으로 단일 export로 수렴. |
| P2 | 네비게이션 제목/그룹·섹션 제목/설명 데이터가 두 위치에 분산 | 단일 route metadata 소유자 정하기. 표시명 변경 시 breadcrumb·권한 메뉴·딥링크 회귀 확인. |
| P2 | table caption, sticky, row action, empty/loading, pagination, 검색 위치가 화면마다 다름 | 공통 계약을 필수/선택으로 나눠 정의. 검토 큐·편집기는 예외 허용. |
| P3 | 토큰과 직접값, 사각형/알약 badge, 38/40/44px 컨트롤 및 간격 차이 | 실제 computed style·breakpoint 스냅샷을 수집해 토큰 정리. 의미 있는 도메인 차이는 유지. |

## 11. 공통화 후보와 Phase 2 권장사항

| 후보 | 현재 기반 | Phase 2에서 먼저 정할 계약 |
|---|---|---|
| `AdminLayout` / `PageHeader` | `AdminShell`, `AdminPage/Header`, 이전 `AdminHeading` | 폭·breadcrumb·제목/설명/주 액션·모바일 동선 |
| `FilterBar` / `SearchInput` | `AdminTableToolbar`, `AdminSearchField`, `.filter-row` | 필터 적용 범위(전체/현재 페이지), 즉시/Apply, 초기화, URL 상태 |
| `SummaryCard` | `AdminMetric`·이전 `Metric`·member compact summary | 집계 분모·기간·결과 건수 정의와 compact/wide variant |
| `DataTable` / `Pagination` | `AdminDataTable/AdminPagination`, 이전 table | caption, 열 폭, sticky, 정렬, row action, page-size, empty/loading, 모바일 |
| `StatusBadge` | `AdminStatusBadge`, 이전 `Badge`, member badge | 도메인 상태 → 문구/tone 매핑, 컬러 의미·접근성 |
| `DetailDrawer` / `Modal` | 공통 dialog, member/order 자체 overlay | 초점 이동/복귀, Escape, scroll lock, URL/필터 유지, 중첩 동작 |
| `EmptyState` / `Toast` / `Tooltip` | 공통+이전 구현 병존 | 원인별 안내 CTA, 비동기 성공/실패, 도움말 접근성 |

권장 순서는 **(1) 범위·상태·집계 용어 계약과 대표 화면 3개 선정 → (2) 토큰 및 component contract 검증 → (3) 범용 목록/주문/회원 미션 각 1개 화면에서 점진 적용 → (4) 나머지 화면으로 확장·반응형/키보드/권한/실데이터 회귀 QA**다. 대표 화면은 `products`(일반 목록), `orders`(기간+상태), `members`(서버/로컬 혼합)를 권장한다. `reviews`, `learning`, `missions`는 표로 단순 변환하지 말고 업무 흐름을 별도로 검증한다. 각 단계에서 기존 기능·데이터·딥링크·권한·CSV·저장/보관 동작을 보존해야 한다.

**Phase 2는 시작하지 않는다.** 이 문서는 구현 승인이나 배포 승인이 아니다.
