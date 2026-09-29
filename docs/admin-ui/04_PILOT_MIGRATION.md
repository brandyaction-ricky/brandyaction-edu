# Admin 파일럿 마이그레이션 — Phase 4

> 2026-09-27 · 선행: [01_ADMIN_AUDIT.md](./01_ADMIN_AUDIT.md), [02_ADMIN_DESIGN_SYSTEM.md](./02_ADMIN_DESIGN_SYSTEM.md), [03_ADMIN_COMPONENTS.md](./03_ADMIN_COMPONENTS.md)
> 기준: `8248326dc7b51c28b1599c982bf9a654ba13c22a` (Phase 3) · 작업 브랜치 `codex/admin-ui-pilot-20260927`
> 범위: 대표 4종 화면의 UI 파일럿. API·DB·권한·상태 모델·결제/환불 처리 로직은 변경하지 않았다. Phase 5는 시작하지 않는다.

## 적용 화면과 Before → After

| 유형 / 화면 | Before 문제 | 적용 컴포넌트와 변경 내용 |
|---|---|---|
| Data Heavy `/admin/orders` | 날짜 조회, 상품·상태·검색, KPI, 표가 분리되고 결제 실패·환불 확인·수강권 누락을 상태별로 찾기 어려움. 주문 상세가 자체 dialog를 사용 | `AdminFilterBar`에 기간·범위·검색·조회/초기화를 모음. `AdminSummaryCard` 4개를 compact로 배치. 현재 조회 페이지의 `결제 실패 / 환불 확인 / 수강권 확인` `AdminQuickFilter`와 `AdminDataTable`, `AdminStatusBadge`, `AdminDrawer`, 기존 `AdminPagination` 사용. 기존 상세 내용·영수증·권한/환불 연결 유지 |
| Operation Heavy `/admin/members` | 회원별 표/상세는 이미 있으나 전용 필터·요약·quick filter·자체 drawer를 써 다른 업무 화면과 시각·키보드 계약이 다름 | 기수→주차→미션→상태→회원 검색을 `AdminFilterBar`로 통합. compact `AdminSummaryCard`, `AdminQuickFilter`, `AdminDataTable`, `AdminStatusBadge`, `AdminDrawer`로 정리. 정렬 열에 `aria-sort`를 연결. 행 선택→우측 Drawer→기존 검토/미션 설정 링크 동선 보존 |
| CRUD `/admin/products` | 목록 전용 toolbar와 table, 상태 배지/행 버튼이 공통 시스템과 다르고 등록 CTA가 헤더에 떨어져 있음 | `AdminFilterBar` 안에 유형·판매 범위·상태·검색·등록을 배치. compact `AdminSummaryCard`, `AdminDataTable`, `AdminStatusBadge`, semantic `AdminButton` 사용. 헤더 중복 등록 버튼만 제거. 편집·보관·복원 핸들러 및 현재 페이지 검색/서버 페이지네이션 유지 |
| Form Heavy `/admin/product-editor` | 기본정보 폼의 개별 입력/선택/textarea와 저장 버튼이 공통 크기·레이블·오류 규칙과 다름 | `PageHeader`, `PageSection`, `AdminInput`, `AdminSelect`, `AdminTextarea`, `AdminButton`, `AdminInlineError` 적용. 미리보기·탭·업로드·HTML·기수·커리큘럼의 복잡한 독립 편집기는 유지. 필수 필드, 미저장 안내, 저장/취소, 삭제 확인 로직 보존 |

상품 목록을 CRUD 대상으로 선택했으므로 클래스 목록은 이번 파일럿에서 변경하지 않았다. 나머지 Admin 페이지도 변경하지 않았다.

## 디자인 시스템/컴포넌트 검증에서 발견한 문제

| 발견 | 공통 수정 | 검증 |
|---|---|---|
| 긴 주문 기간 필터와 회원 5개 범위 필터가 한 줄을 넘을 때 `FilterBar`의 desktop flex가 넘칠 수 있음 | `admin-system.css`의 파일럿 `FilterBar` 조합에 wrap·검색 최소 폭 규칙을 토큰으로 추가. 컴포넌트 API/데이터 동작 변경 없음 | 1440/834/390px 합성 브라우저 동작 검사 |
| children 기반 `AdminDataTable`의 정렬 헤더 버튼은 `[aria-sort]`가 없는 기본 정렬 상태에서 브라우저 기본 버튼처럼 보임 | 공통 DataTable 헤더 버튼의 기본/hover/focus 스타일을 추가하고 회원 정렬 열에 `aria-sort` 지정 | computed style 및 정렬/Drawer 브라우저 테스트 |
| 주문 표에서 주 정보(회원명)와 보조 정보(이메일)가 붙어 보임 | 파일럿 DataTable의 보조 이메일을 caption/별도 줄로 표시. 공통 색·타이포 토큰 사용 | 실제 브라우저 스크린 확인 |

Phase 2의 역할 기반 색상, control height, radius, 표 density 계약은 유지했다. 발견 문제를 화면별 임의 색/크기 예외로 우회하지 않았으며 이번 파일럿에서 02 문서의 규칙 변경은 필요하지 않았다. `AdminDataTable` API 자체 변경도 최종적으로 필요하지 않았다.

## 운영 흐름/회귀 결과

| 범위 | 확인 결과 |
|---|---|
| 상태 파악→탐색→상세→조치 | 주문: 예외 Quick Filter→주문 행→상세 Drawer. 회원: 기수·주차→상태/검색→회원 행→미션 Drawer→검토 링크. 상품: 유형/상태/검색→행 수정·보관·복원. 폼: 필수 입력→저장 피드백. 모두 합성 브라우저에서 동선 확인 |
| 검색·필터·날짜 | 상품 즉시 검색·유형/상태, 주문 검색·빠른 필터·기간 역전 오류, 회원 기수·주차·미션/상태 필터와 빠른 상태 탭 확인. 주문 기간은 **적용 버튼 이후**, 다른 목록 검색은 기존과 같이 **현재 조회 페이지** 범위 |
| Pagination | 기존 상품/주문 `AdminPagination`과 회원 서버 50건 묶음+로컬 페이지 크기 방식을 유지. 공통 Pagination 자체는 Phase 3 합성 회귀로 확인. 이 파일럿은 서버 범위를 임의 변경하지 않음 |
| CRUD·권한 | 상품 편집, 보관·복원, 폼 필수값·저장 피드백을 메모리 기반 합성 fixture로 확인. 기존 상품 편집 왕복/조회 실패/권한 거부 브라우저 회귀 3건 통과. 실제 권한은 서버 API가 계속 검사하며 UI만으로 권한을 부여하지 않음 |
| 결제·환불 | 결제 실패/환불 `processing`/결제 완료·수강권 누락을 **읽기 전용 합성 데이터**로 검사. 실제 결제, 환불, 수강권 부여/회수 API는 호출하지 않음 |
| 미션 | 회원의 최신 제출 상태·검토/재제출 딥링크와 Drawer 닫기/포커스 복귀를 합성 브라우저로 확인. 미션 저장/승인 API는 호출하지 않음 |
| 정적·빌드 | `npx tsc --noEmit --incremental false`, `npm run build --webpack`, `npm test` 451/451 통과. 변경 TSX ESLint 오류 0건. 기존 `<img>` 최적화 경고는 남음 |
| 브라우저 | 신규 파일럿 4개 시나리오와 기존 공통 컴포넌트·상품 편집 왕복·회원 운영 동선의 desktop/tablet/mobile 회귀 총 51/51 통과. 로컬 합성 fixture는 Auth/운영 DB/결제 연결 없음 |

검증 코드: `tests/browser/admin-pilot.spec.ts`, `tests/browser/fixture/admin-pilot.tsx`, 기존 `tests/browser/admin-product-navigation.spec.ts`와 `tests/final-uiux.test.mjs`. 직접 브라우저에서 상품 목록·주문/상세 Drawer·회원 미션 표·상품 편집 폼의 시각 상태를 확인했다.

## 실제 운영/Full Migration 게이트

**코드 파일럿은 구현·합성 검증 완료, 실제 운영 환경 검증은 미완료.** 실 계정으로 읽기 전용 dev QA를 수행해 기간/검색/서버 총건수, 상품/회원 권한, 실제 상태 코드와 긴 텍스트, 테이블 가로 스크롤·Drawer, 페이지네이션을 확인해야 한다. 쓰기 검증은 별도 승인된 개발 DB/샌드박스 결제에서만 수행한다. 환불/결제/실수강권 변경은 이번 작업에서 실행하지 않았다. 특히 현재 페이지 검색과 서버 전체 건수 혼동, 상품 KPI 서버 집계와 목록 로컬 필터 범위 차이, 회원 서버 50건과 quick filter 현재 조회 범위는 Phase 1·2에서 지적된 계약 문제로 남는다. 전체 Admin 전환 전 데이터 범위 정의와 실제 운영자 UAT가 필요하다.

Preview, PR, push, `develop` 병합, dev/운영 배포는 이 Phase 4 요청에 포함하지 않아 실행하지 않았다. Phase 5는 자동 시작하지 않는다.
