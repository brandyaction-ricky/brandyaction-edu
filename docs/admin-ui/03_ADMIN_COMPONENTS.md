# Admin 공통 컴포넌트 — Phase 3

> 2026-09-27 · 선행: [01_ADMIN_AUDIT.md](./01_ADMIN_AUDIT.md), [02_ADMIN_DESIGN_SYSTEM.md](./02_ADMIN_DESIGN_SYSTEM.md) · 범위: **공통 구현 및 합성 데이터 검증**. 기존 Admin 페이지 전체 전환, API/DB/권한 변경, Phase 4는 포함하지 않는다.

## 구현 위치와 적용 경계

- 컴포넌트: `features/admin-ui/components/admin-system.tsx` (`features/admin-ui/index.ts`에서 재수출)
- 토큰과 스타일: `features/admin-ui/styles/admin-system.css`; **`.edu-admin` 하위에서만** 유효. 기존 Admin 셸이 이미 불러오는 CSS를 확장했으며 새 스타일링 라이브러리는 추가하지 않았다.
- 합성 검증 화면: `tests/browser/fixture/admin-components.tsx`, 경로 `/admin-component-system-test`는 Playwright fixture 서버에서만 존재한다. 실제 라우트나 운영 데이터는 없다.
- 회귀 검증: `tests/browser/admin-components.spec.ts`. 기본/hover/focus/disabled/loading/error/empty, 정렬·선택·행 클릭·페이지 이동·오버레이 포커스, 데스크톱/모바일 필터 배치를 검증한다.

기존 `AdminButton.tone`, `AdminPage`/`AdminPageHeader`/`AdminSection`/`AdminContent`, `AdminDataTable`의 자식 `<thead>/<tbody>` 사용, `AdminStatusBadge`, `AdminDialog*`, `AdminToast`는 유지했다. 새 페이지는 아래 semantic API를 우선 사용한다. 기존 `app/ui/final/*` 컴포넌트 및 페이지는 이 단계에서 교체하지 않는다.

## Design token

| 종류 | CSS 변수 | 계약 |
|---|---|---|
| Color | `--admin-color-{primary,background,surface,surface-subtle,border,border-strong,text,text-secondary,text-muted,success,warning,error,info,neutral}` 및 의미별 `-soft` | Phase 2 §2 기준. 기존 `--admin-*` 별칭은 호환 유지 |
| Spacing | `--admin-space-{1,2,3,4,6,8,10,12}` | 각각 4/8/12/16/24/32/40/48px |
| Typography | `--admin-type-{page,section,body,label,caption,table}` | Phase 2 §3의 size/weight/line-height |
| Radius | `--admin-radius-{sm,md,lg}` | 4/6/8px. Badge·Switch의 pill은 의미상 예외 |
| Control | `--admin-control-height-sm`, `--admin-control-height`, `--admin-control-height-lg` | 36/40/48px; 모바일 버튼은 최소 44px |
| Border/Shadow | `--admin-border-width`, `--admin-shadow-overlay` | 1px 경계. 기본 레이아웃 그림자 금지, overlay에만 shadow |

토큰은 `Admin` 영역의 **신규 공통 컴포넌트 계약**이다. 이전 CSS가 동시에 존재하므로 기존 페이지에 값을 일괄 덮어씌우지 않았다. Phase 4의 페이지별 실측과 점진 이행이 필요하다.

## 컴포넌트 API / 사용 목적

| 범주 | Component | 주요 Props·Variant | 사용 목적 |
|---|---|---|---|
| Layout | `AdminShell`(기존), `AdminLayout`=`AdminPage`, `PageHeader`, `PageSection`, `ContentContainer` | `width: wide/standard/narrow`, `template`, `title/description/actions`, `bordered` | 기존 권한·내비 셸은 유지하고 페이지 내부의 폭·제목·섹션 계층을 구성 |
| Form | `AdminButton`, `AdminIconButton` | `variant: primary/secondary/outline/ghost/danger`, `size: sm/md/lg`, `loading`, `disabled`; 이전 `tone` 호환 | 의미 기반 주/보조/위험 동작. loading은 `aria-busy`와 disabled 동시 적용 |
| Form | `AdminInput`, `AdminSearchInput`=`AdminSearchField`, `AdminSelect`, `AdminTextarea`, `AdminDatePicker` | `label`, `labelHidden`, `helper`, `error`; Input/Select/Search/DatePicker `size` | 연결된 레이블·도움말·오류와 같은 높이·focus 상태. 검색은 즉시 입력만 제공하고 실제 검색 범위는 호출자가 정함 |
| Form | `AdminCheckbox`, `AdminRadio`, `AdminSwitch` | `label`, `helper`, native checked/onChange/disabled | 복수 선택/단일 선택/즉시 효력 설정. Switch는 `role=switch` |
| Data | `AdminSummaryCard`(기존 `AdminMetric` 재사용), `AdminStatusBadge` | `label/value/note/scope/compact`, `status/label/tone` | 지표의 범위 표시, 도메인 상태의 문구+색 표현. tone은 neutral/info/success/warning/error (`danger` 호환) |
| Data | `AdminQuickFilter` | `items[{value,label,count}], value, onChange` | 즉시 상태 전환; 선택을 `aria-pressed`로 알림 |
| Data | `AdminPagination` | `page/pages/onChange`, 선택적 `total/pageSize/onPageSizeChange` | 범위·전체 건수·페이지 크기. `total`의 DB/필터 범위는 호출자가 명시 |
| Data | `AdminDataTable` | `label`, `rows/columns/getRowId`, `density`, `sticky`, `rowLabel/onRowClick`, `sort/onSortChange`, `selection`, `pagination`, `loading/empty/error` | 정렬·선택·일괄 액션·커스텀/상태/액션 셀을 **선택적으로** 쓰는 목록. 기존 children 기반 테이블도 계속 지원 |
| Filter | `AdminFilterBar` | `filters/status/date/search/action`, `onReset/onApply`, `appliedSummary` | 범위→상태/날짜→유연한 검색→액션 순서. 검색 방식/실제 적용 조건은 호출자가 소유 |
| Feedback | `AdminEmptyState`, `AdminSkeleton`=`AdminLoadingSkeleton`, `AdminLoadingState`, `AdminErrorState`, `AdminInlineError`, `AdminAlert`, `AdminToast` | `title/children/action/onRetry`, Alert `tone: info/success/warning/error`, Toast `tone: neutral/success/error` (`danger` 호환) | 빈/로딩/복구 가능한 오류·지속 안내·일시 메시지를 구별. 영구 오류를 Toast만으로 전달하지 않음 |
| Overlay | `AdminModal`, `AdminConfirmDialog`, `AdminDrawer`, `AdminPopover`, `AdminTooltip` | `title/onClose`, Drawer `size`, Tooltip `content`, Popover `label` | 짧은 확인/삭제=Modal, 상세·검토=Drawer, 소형 부가 메뉴=Popover, 보조 설명=Tooltip. Dialog 제목 초기 포커스·Escape·복귀 유지 |

### DataTable의 선택형 기능

`columns`의 `value`는 기본 텍스트·수치, `render`는 custom/action 셀, `status`는 `AdminStatusBadge` 셀이다. `sortable`로 선언한 열에만 정렬 버튼을 그린다. `onSortChange`가 없으면 전달된 **현재 `rows`에 대해서만** 로컬 정렬하고, 있으면 호출자가 서버 정렬/범위를 처리한다. `selection`은 controlled `selectedIds/onChange`이며 현재 보이는 행에만 전체 선택을 적용한다. `bulkActions`는 선택이 있을 때만 표시한다. `onRowClick`은 키보드 Enter/Space도 지원하고 셀 내부 버튼/링크 조작을 가로채지 않는다. `loading`은 행이 없는 경우 skeleton, 기존 행이 있는 경우 갱신 알림을 표시한다. `empty`는 상황별 설명을 호출자가 지정한다. `pagination`은 표 아래에만 표시된다. 모든 표에 정렬·선택·페이지네이션을 강제하지 않는다.

### 간단한 사용 예

```tsx
import {
  AdminButton, AdminDataTable, AdminFilterBar, AdminSearchInput,
  AdminSelect, AdminStatusBadge, AdminSummaryCard, PageHeader,
} from '@/features/admin-ui';

<>
  <PageHeader title="회원" description="현재 필터 결과를 확인합니다." />
  <AdminFilterBar
    filters={<AdminSelect label="상품" labelHidden value={courseId} onChange={event => setCourseId(event.target.value)}>{options}</AdminSelect>}
    search={<AdminSearchInput label="회원 검색" value={query} onChange={event => setQuery(event.target.value)} />}
    action={<AdminButton variant="primary" onClick={openCreate}>등록</AdminButton>}
    appliedSummary="검색·건수는 현재 필터 결과 기준"
  />
  <AdminSummaryCard label="검토 필요" value={pendingCount} scope="현재 필터 결과" compact />
  <AdminDataTable
    label="회원 목록" rows={rows} getRowId={row => row.id}
    columns={[
      { id: 'name', header: '회원', value: row => row.name, sortable: true },
      { id: 'status', header: '상태', render: row => <AdminStatusBadge status={row.status} /> },
    ]}
    empty="현재 필터에 결과가 없습니다."
    loading={loading}
  />
</>
```

예제의 `rows`, 필터·집계 범위, 권한·저장 로직은 페이지가 소유한다. `AdminFilterBar`의 Reset/Apply는 콜백을 호출할 뿐 URL·API·기간 적용 방식을 임의로 바꾸지 않는다.

## 금지 패턴 / 이행 조건

- `redButton`, `greenBadge`, 화면별 임의 radius/height/hex 생성 금지. `variant`와 의미 기반 token 사용.
- 검색창 placeholder만으로 label 대체 금지. Toolbar에서 레이블을 숨길 때도 `labelHidden` 사용.
- 컬러만으로 상태 전달 금지. 도메인 상태 코드와 보이는 문구를 대조하고 검토 필요/오류를 조치와 연결.
- `0/0`을 “미제출”, 보관 건을 “없음”으로 표시하거나, 현재 페이지 검색을 전체 결과 검색으로 설명하지 않기.
- `AdminDataTable` 로컬 정렬/선택을 서버 전체 범위인 것처럼 표기하지 않기. 총건수와 페이지 크기는 호출자가 응답/필터 기준으로 제공.
- 장기 오류·미저장 상태를 Toast로만 알리지 않기. 영구 상태는 Alert/ErrorState 또는 폼 오류로 남기기.
- 기존 관리자 페이지·legacy `app/ui/final/*`를 이번 단계에서 일괄 치환하지 않기. 대표 화면별 기능 동등성, 데이터 범위, 키보드, 모바일 QA 후 이행.

## 검증과 다음 게이트

검증 결과(2026-09-27): `npx tsc --noEmit --incremental false` 통과, 변경 TSX 대상 ESLint 경고 0건, `npm test` 451건 통과, `npm run build` 통과, 합성 브라우저 테스트 데스크톱/태블릿/모바일 12건 통과 및 기존 Admin focus/shell 회귀 24건 통과(화면 크기별 조건부 3건 제외). 전체 저장소 lint에는 이 변경과 무관한 기존 `<img>` 경고가 남아 있다. 브라우저 fixture는 Auth/DB/운영 API에 연결되지 않는다. 테스트 통과는 실제 Admin 페이지의 데이터 범위·권한·기간 필터·CSV·저장 동작 검증을 대체하지 않는다. Phase 4는 별도 승인과 대표 화면 선정 후 시작한다.
