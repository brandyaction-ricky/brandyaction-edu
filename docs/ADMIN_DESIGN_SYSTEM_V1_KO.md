# BrandyAction EDU Admin Design System v1

이 문서는 Phase 0에서 정의한 관리자 전용 UI 규칙과 Phase 1 적용 기준을 기록한다. 관리자 UI는 `.edu-admin` 안에서만 동작하며 사용자 화면의 전역 크기 토큰은 변경하지 않는다.

## 기존 구조 점검

기존 기반은 `admin-shell.tsx`, `admin.css`, `tokens.css`와 화면별 CSS로 구성되어 있었다. 공통 React UI는 `AdminHeading`, `Metric` 중심이었고, 버튼·입력·표·상태·오버레이는 화면별 마크업과 CSS에 의존했다.

주요 충돌과 예외는 다음과 같다.

| 영역 | 기존 상태 | v1 기준 |
| --- | --- | --- |
| Sidebar | 222px, 240px, 전역 변수 규칙이 중첩 | 관리자 scope에서 224px |
| Topbar | 화면 CSS에서 65px 계열 사용 | 64px |
| Content | 1,552px·1,720px와 화면별 폭 혼재 | wide 1,440px / standard 1,280px / narrow 960px |
| Control | 전역 48px, 관리자 38px·44px 혼재 | 기본 38px / compact 32px / 모바일 최소 44px |
| Table | 전역 64px와 화면별 padding 혼재 | header 40px / row 44px |
| Surface | `.panel`, `.card`, 화면별 카드 중복 | `AdminSection`과 필요한 KPI surface만 사용 |
| Overlay | 화면별 modal/drawer CSS와 footer 중복 | native dialog 기반 공통 Drawer·Modal |
| Status | 화면별 번역과 badge class 중복 | 공통 상태 dictionary와 `AdminStatusBadge` |

`admin.css`의 기존 선택자는 Phase 2 이후 화면이 계속 사용하므로 Phase 0에서 일괄 삭제하지 않는다. 새 화면은 `admin-system.css`를 사용하고, 메뉴군 전환 시 검증된 범위만 기존 규칙에서 제거한다.

## 관리자 전용 토큰

토큰은 `app/ui/final/admin-system.css`의 `.edu-admin`에 정의한다.

```css
--admin-sidebar-width: 224px;
--admin-topbar-height: 64px;
--admin-content-wide: 1440px;
--admin-content-standard: 1280px;
--admin-content-narrow: 960px;
--admin-control-height: 38px;
--admin-control-height-sm: 32px;
--admin-table-row-height: 44px;
--admin-table-head-height: 40px;
--admin-page-gap: 32px;
--admin-section-gap: 32px;
--admin-component-gap: 16px;
--admin-control-gap: 8px;
--admin-surface: #fff;
--admin-surface-subtle: #f7f8fa;
--admin-surface-hover: #fafbfc;
--admin-border: #e2e5e9;
--admin-radius-control: 6px;
--admin-radius-surface: 8px;
```

`tokens.css`의 `--control-height`, `--button-height`, `--table-row-height`, `--card-padding`는 사용자 화면과 공유되므로 변경하지 않는다.

## 공통 Component

모든 Component는 `app/ui/final/admin-system.tsx`에서 export한다.

| 분류 | Component |
| --- | --- |
| Layout | `AdminPage`, `AdminPageHeader`, `AdminContent`, `AdminSection`, `AdminDivider`, `AdminStack`, `AdminGrid` |
| Control | `AdminButton`, `AdminIconButton`, `AdminInput`, `AdminSelect`, `AdminTextarea`, `AdminCheckbox`, `AdminDatePicker`, `AdminSearchField`, `AdminFilterTrigger` |
| Data | `AdminMetricGrid`, `AdminMetric`, `AdminDataTable`, `AdminTableToolbar`, `AdminPagination`, `AdminStatusBadge`, `AdminEmptyState`, `AdminSkeleton`, `AdminInlineError` |
| Overlay | `AdminDrawer`, `AdminModal`, `AdminConfirmDialog`, `AdminPopover`, `AdminToast` |

`AdminDrawer`와 `AdminModal`은 native `<dialog>`를 사용한다. 브라우저의 focus trap과 Escape 동작을 유지하고, 닫힌 뒤 실행 버튼으로 focus를 복귀하며, 중첩 확인창에서도 body scroll lock을 보존한다. Drawer 크기는 small 400px, default 520px, large 640px이며 모바일에서는 전체 화면으로 전환한다.

상태 dictionary는 내부 enum을 한글 문구로 변환한다. 등록되지 않은 상태는 내부값 대신 `상태 확인 필요`로 표시한다.

## 사용 규칙

페이지 root는 목적에 맞는 폭과 template을 명시한다.

```tsx
<AdminPage width="wide" template="analytics">
  <AdminPageHeader title="페이지 제목" description="한 줄 설명" />
  <AdminSection bordered title="분석 영역">
    <AdminDataTable label="성과표">...</AdminDataTable>
  </AdminSection>
</AdminPage>
```

- Data List: Page Header → Toolbar → Data Table/List → Pagination → Detail Drawer
- Analytics: Page Header → 조회 Toolbar → KPI → 상세 분석 → 운영 데이터 → 설정 Drawer
- Editor: Page Header → Editor Body → Preview/Inspector → Sticky Save Bar
- Review Workspace: Queue → Main Detail → Inspector → Sticky Review Action
- Settings: Page Header → Section Navigation → Form Section → Sticky Save Bar

화면별 CSS에는 데이터 시각화, sticky 식별 열, 화면 고유 배치처럼 공통 Component로 표현할 수 없는 조합만 둔다. 버튼·입력·표·상태·오류·빈 상태·오버레이의 기본 모양을 화면 CSS에 다시 작성하지 않는다.

## Phase 1 기준 화면

`/admin/landing`은 Analytics template의 첫 적용 화면이다.

1. 공통 Page Header
2. sticky compact 조회 Toolbar
3. 8개 핵심 KPI
4. 정렬 가능한 소재별 성과표
5. 지표 선택 및 비교를 지원하는 일별 추이와 상세표
6. 운영 요약과 일별 실측 기록을 묶은 통합 Grid
7. 실측 추가·수정 Drawer
8. 캠페인·가격·Meta 설정 Right Drawer와 sticky save bar

기존 `/admin/metrics` redirect, URL의 클래스·캠페인·기간·필터 상태, CSV 조건, 서버 권한 검사, 트래킹 집계, Meta 동기화, 실측 부분 저장과 단가 snapshot은 그대로 사용한다.

## 다음 Phase 적용 절차

1. 대상 화면의 권한·API·저장 플로우를 먼저 고정한다.
2. 다섯 Template 중 하나를 선택한다.
3. 공통 Component로 마크업을 전환한다.
4. 화면 CSS에서 대체된 generic 규칙만 제거한다.
5. Loading·Empty·Error·Permission과 모바일을 검증한다.
6. DEV QA PASS 뒤 다음 메뉴군으로 진행한다.

Phase 1 QA PASS 전에는 Phase 2 화면을 일괄 전환하지 않는다.
