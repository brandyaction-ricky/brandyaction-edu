# Admin Design System — Phase 2

> 작성일: 2026-09-27 · 기준 소스: `4d92cdc8c51245f3b2cd42908b0dea07dd9d1aa0` · 선행 문서: [01_ADMIN_AUDIT.md](./01_ADMIN_AUDIT.md)
> 상태: **설계 계약 / 미구현**. 이 문서는 Admin UI의 목표 규칙을 정의한다. 현재 적용 완료를 뜻하지 않으며, 페이지·컴포넌트·CSS·기능·데이터 구조를 변경하지 않는다. Phase 3는 별도 승인 전 시작하지 않는다.

## 0. 근거와 적용 범위

Phase 1 감사의 §4–9는 새 `features/admin-ui` 시스템과 이전 `app/ui/final` 패턴이 공존함을 확인했다. 새 시스템의 현재 값은 콘텐츠 폭 1440/1280/960px, gutter 32/24/16px, 컨트롤 40px(작은 크기 36px), 테이블 행/헤더 44px, control/surface radius 6/8px이다. 전역 `tokens.css`의 48px 컨트롤·64px 테이블 행과 이전 Admin의 38px 입력이 함께 존재한다. 아래 표의 값은 이를 바탕으로 만든 **Admin 전용 목표 계약**이다. 현재 구현값과 다른 수치는 “목표”로 표시하며 후속 화면 실측·QA 없이 기존 기능에 일괄 적용하지 않는다.

공통 규칙은 `.edu-admin` 영역에만 적용한다. 고객 화면의 토큰, 상품·미션·주문 상태 모델, API 집계, 권한, URL, CSV 범위는 이 문서가 변경하지 않는다. 데이터 범위와 상태 의미가 확정되지 않은 P1은 시각 규칙만으로 해결됐다고 간주하지 않는다.

## 1. Design Principle / 의사결정 순서

1. **정보 탐색:** 현재 상품·기수·주차·기간·필터·페이지 범위를 먼저 보인다.
2. **상태 파악:** 정상/진행/대기/실패를 문구와 형태로 식별하며 색만으로 구별하지 않는다.
3. **예외 발견:** 검토·실패·미설정 등 조치 필요 항목을 단순 완료보다 먼저 찾게 한다.
4. **빠른 처리:** 목록에서 대상→상세→해당 CTA까지 이동을 최소화하되 실수하기 쉬운 결정에는 확인 단계를 둔다.
5. **데이터 밀도:** 1440px 데스크톱에서 표의 스캔성을 높이되 긴 이름·이메일·수치의 판독성을 희생하지 않는다.
6. **일관성:** 동일 의미와 계층은 같은 용어·크기·위치·상호작용을 사용한다.
7. **심미성:** 장식·그림자보다 선, 타이포그래피, 간격으로 위계를 만든다.

충돌 시 번호가 낮은 원칙을 우선한다. 예컨대 밀도 향상을 위해 집계 범위 문구나 실패 피드백을 숨기지 않는다. `learning`·`missions`·`reviews` 같은 특수 업무 화면에 표를 강제하지 않는다(감사 §7, §10).

## 2. Color System

색은 화면별 임의 hex가 아니라 의미 역할로 호출한다. 아래 값은 기존 `app/ui/final/tokens.css` 및 `features/admin-ui/styles/admin-system.css`의 색을 기준으로 한 목표 별칭이다. “목표 별칭”은 아직 CSS 변수가 생성됐다는 뜻이 아니다.

| 역할 / 목표 별칭 | 기준색 | 사용 규칙 |
|---|---|---|
| Primary `admin.color.primary` | `#c9232d` | 브랜드 주 액션, 활성 탭. 의미상 오류와 혼동되지 않게 오류에는 문구/아이콘을 함께 사용 |
| Primary hover / pressed | `#a71922` / `#88121b` | 주 액션의 상호작용 단계 |
| Background | `#f7f8f9` | Admin 작업 영역 바탕. 표/폼 표면과 구별 |
| Surface / Surface subtle / Surface hover | `#ffffff` / `#f7f8fa` / `#fafbfc` | 표·폼 표면 / 헤더·보조 영역 / 행 hover. 선택 상태는 hover와 구별 |
| Border / Border strong | `#e2e5e9` / `#c8cdd5` | 구획·행 구분 / 입력 및 강조 경계. 새 시스템의 두 값 사용 |
| Text primary / secondary / muted | `#161719` / `#626770` / `#5f6670` | 주요 정보 / 설명·보조 정보 / 비핵심 메타. 필수 정보·상태를 muted로 낮추지 않음 |
| Text inverse | `#ffffff` | 어두운 버튼·배지 위 텍스트 |
| Success / soft | `#176345` / `#eaf5ef` | 정상 완료·승인·공개·활성 |
| Warning / soft | `#865600` / `#fff6df` | 사람의 확인·보완·조치가 필요한 상태 |
| Error / soft | `#a71922` / `#fff0f1` | 실패·거절·파괴적 결과. Primary와 동일 계열이지만 의미는 텍스트/아이콘으로 분리 |
| Info / soft | `#315e8b` / `#edf3f9` | 진행 중·예약·중립적 알림 |
| Neutral / soft | `#50545b` / `#f0f2f4` | 비공개·보관·취소·미설정이 아닌 일반 비활성 |
| Focus | `#315f9a` | 키보드 포커스. 기존 Admin focus ring 값을 유지 |

사용 계약: 밝은 배경 위 텍스트와 배지의 읽힘, 경계·포커스의 식별성은 실제 화면/브라우저에서 검증한다. 차트나 KPI에서도 성공=녹색처럼 색만으로 의미를 전달하지 않고 레이블·범례·수치를 함께 둔다. 반투명 오버레이와 disabled 색은 콘텐츠별 직접값을 만들지 말고 역할 토큰의 상태로 관리한다.

## 3. Typography

폰트 계열은 기존 `Pretendard → Noto Sans KR → Apple SD Gothic Neo → system sans-serif` 흐름을 유지한다. 아래 규격은 `font-size / font-weight / line-height`; Admin의 기존 24px page title, 13px table body, 12px header를 기준으로 정리했다.

| 역할 | 규격 | 규칙 |
|---|---|---|
| Page Title | `24px / 700 / 32px` | 한 페이지 한 개. 긴 제목은 줄바꿈 허용 |
| Section Title | `16px / 600 / 24px` | 섹션 경계·본문 위계. 기존 `650`은 목표 `600`으로 통일(미적용) |
| Body | `14px / 400 / 22px` | 설명·짧은 안내. 긴 본문만 필요 시 줄간격 확대 |
| Label | `13px / 600 / 20px` | 폼 레이블·필터명. 필수 표시는 텍스트로도 식별 |
| Caption | `12px / 400 / 18px` | 범위·갱신 시각·도움말. 중요 정보를 Caption만으로 전달하지 않음 |
| Table Header | `12px / 600 / 18px` | 열 의미·정렬 상태 표시 |
| Table Primary | `13px / 500 / 20px` | 이름·제목. 클릭 가능한 주 데이터만 `600` 허용 |
| Table Secondary | `12px / 400 / 18px` | 이메일·ID·보조 맥락. 주 정보와 같은 셀에 배치 가능 |
| KPI Value | `28px / 700 / 36px` | Dashboard 큰 지표의 상한. Operation의 compact summary는 `20px / 700 / 28px` 목표 |

금액·건수·날짜는 표에서 tabular numeral을 사용한다. 한국어/영어 혼용 제목도 각 계층의 규격을 유지한다. 한 표 안에서 이름/상태/액션의 강조 기준을 바꾸지 않는다.

## 4. Spacing, Width, Radius, Control Size

기본 spacing scale은 **4 / 8 / 12 / 16 / 24 / 32 / 40 / 48px**이다. 20px 등 기존 값은 감사된 이행 대상이며 새 화면의 기본값으로 추가하지 않는다.

| 영역 | 목표 규칙 | 감사와의 관계 |
|---|---|---|
| Page width | wide `1440px`, standard `1280px`, narrow `960px` 최대폭 | 현재 셸 값 유지. 목록/업무=wide, 일반 폼=standard, 제한된 설정 폼=narrow를 기본으로 선택 |
| Page padding | desktop `32px`, tablet `24px`, mobile `16px` | 현재 셸 값 유지 |
| Page header → 첫 작업 영역 | `24px` 또는 요약이 있으면 `32px` | 32px page gap보다 조밀한 목록에만 24px 허용 |
| Section gap | `32px`; mobile `24px` | 현재 시스템 값 유지 |
| Section 내부 gap | `16px`; toolbar·관련 컨트롤 gap `8px` | 현재 component/control gap 유지 |
| Card / summary padding | compact `16px`, 일반 `24px` | 기존 18/20px 카드 값은 후속 이행 시 정리 |
| Toolbar → table | `12px`; 한 테두리 안에 연속 배치하면 내부 divider 사용 | 검색/필터/데이터를 한 작업 흐름으로 연결 |
| Table cell padding | 가로 `16px`, 세로 `8px` | 현재 12px 가로에서 목표 16px. 지나치게 좁은 화면은 스크롤 우선 |

Radius는 **sm 4px / md 6px / lg 8px** 세 단계로 제한한다. sm=작은 칩·셀 내부, md=컨트롤·버튼, lg=테이블 외곽·카드·dialog. 원형 아바타와 pill badge는 의미 있는 형태 예외이며 신규 임의 radius 값으로 세지 않는다. 그림자는 기본 레이아웃에서 사용하지 않고 떠 있는 dialog/drawer/popover의 층위 표현에만 허용한다.

| 크기 | 높이 | 용도 |
|---|---:|---|
| sm | `36px` | 밀집된 표 내부 액션·보조 필터. 현재 Admin small 유지 |
| md | `40px` | Input / Search / Select / Button / DatePicker의 기본. 같은 toolbar의 모든 컨트롤 높이 일치 |
| lg | `48px` | 큰 폼/터치 맥락. 현재 전역 48px을 Admin 옵션으로만 제한 |

모바일의 클릭 가능한 버튼·아이콘 버튼은 최소 `44px` 높이/폭을 유지한다(현재 Admin mobile 규칙). Textarea는 행 수에 따라 높이가 달라도 border·radius·타이포·상태는 같은 control contract를 따른다.

## 5. Button System

한 작업 영역의 강조된 Primary는 원칙적으로 하나다. 위험 작업을 Primary 색으로 포장하지 않는다.

| Variant | 의미 / 사용 | 현재 구현과의 관계 |
|---|---|---|
| Primary | 저장·등록·확정 등 화면의 주 완료 동작 | 현재 `AdminButton.primary` 기반 |
| Secondary | 주 동작 옆의 보조 동작. 중립 표면·경계 | 현재 `secondary`는 어두운 채움이므로 직접 등치하지 말고 후속 호환 매핑 검증 |
| Outline | 낮은 우선순위지만 경계가 필요한 이동/실행 | 현재 `tertiary`와 화면별 `.btn` 후보 |
| Ghost | 반복되는 표·toolbar의 저강조 동작 | 현재 `tertiary` 일부와 아이콘 버튼 후보 |
| Danger | 삭제·회수·접근 차단처럼 되돌리기 어려운 작업 | 현재 `destructive` 기반. 확인 단계 필요 |

모든 variant는 default/hover/active/focus/disabled/loading을 갖는다. Hover는 표면·경계 변화, active는 누름 피드백, `:focus-visible`은 기존 3px Focus outline과 offset 2px을 목표로 한다. Disabled는 비활성 사유를 주변 설명으로 알리고 pointer뿐 아니라 키보드 동작도 막는다. Loading은 폭을 유지하며 중복 제출을 막고 완료/실패 결과를 알린다. 아이콘 단독 버튼은 접근 가능한 이름과 tooltip/설명을 제공한다.

## 6. Form Control / Filter Interaction

Input, Search, Select, Checkbox, Radio, Switch, Textarea, DatePicker의 공통 기반은 흰 표면·Border strong 1px·radius md·13px/20px 텍스트·Control size md다. Hover는 경계만 강화하고 focus는 Focus 색 경계와 보이는 ring을 사용한다. Error에는 색뿐 아니라 오류 문구와 필드 연결을, disabled/read-only에는 서로 다른 의미와 표시를 준다. Label은 필요 시 화면에서 보이며 placeholder가 유일한 label이 되지 않는다.

| 구성 요소 | 계약 |
|---|---|
| Input | 입력 목적·형식·오류를 가까이에 둔다. 저장 전/후 값을 구분한다. |
| Search | 좌측 검색 아이콘, 한 toolbar에서 select보다 넓은 유연 폭. 별도 검색 버튼은 기본으로 만들지 않는다. **검색 범위(전체 결과/현재 페이지)를 표시**한다. |
| Select | 현재 값·Chevron·필요한 범위명(예: 상품, 상태)을 표시. 옵션 변경 시 종속 필터가 재설정되면 안내한다. |
| Checkbox / Radio | 각각 복수 선택/단일 선택만 표현. 레이블 전체가 클릭 가능하고 선택/미선택/비활성 구분. 현재 공통 `AdminCheckbox`만 확인되어 Radio는 후속 이행 대상. |
| Switch | 즉시 효력이 발생하는 이진 설정에만 사용. 저장 버튼이 필요한 설정은 Checkbox를 우선. 감사에서 공통 `AdminSwitch` 미확인—신규 구현은 Phase 3 검토. |
| Textarea | 긴 답변·설명용. 여러 줄·글자 수·오류를 지원하며 내용이 잘리지 않게 한다. |
| DatePicker | 날짜/시간/시간대(KST 등)와 양 끝 포함 여부를 표시. 기간 조회의 draft와 **적용된 값**을 분리하고 초기화를 제공. |

FilterBar 순서는 **범위 선택(상품/기수) → 상태/기타 select → 검색(남는 폭) → 주 액션**을 기본으로 한다. 업무별 필터가 많을 때는 1차 필터와 접을 수 있는 보조 필터로 나눈다. 즉시 필터와 Apply형 기간을 같은 결과에 적용한다면 현재 적용된 조건·집계 기준을 함께 표시한다. URL/뒤로 가기/Drawer 닫기 시 필터·스크롤 보존을 목표로 하되 현재 화면의 실제 구현/서버 범위는 Phase 3에서 검증한다.

## 7. DataTable System

기본 형태는 흰 Surface, Border 1px, radius lg, 가로 divider만 사용한다. 카드형 개별 행·zebra stripe·장식 그림자는 사용하지 않는다. `AdminDataTable`의 caption·스크롤 힌트·focusable region을 목표 기반으로 삼되 기존 table과의 기능 동등성 확인 전 교체하지 않는다.

| 요소 | 목표 규칙 |
|---|---|
| Header | 높이 `44px`, Surface subtle, 12px/600, 명시적 열 제목·단위. 필요 시 sticky로 하되 상단 toolbar에 가리지 않음 |
| Row density | compact `44px`(현재값), standard `52px`(목표), comfortable `60px`(목표). 화면당 정보·2줄 셀·터치 조건에 맞게 표 단위로 선택; 열별 혼용 금지 |
| Cell | 가로 16px, 세로 8px, 일관된 baseline. 텍스트 좌측, 수치·금액 우측, 상태는 정해진 열, Action은 가장 우측. 날짜 포맷과 시간대 통일 |
| Primary / Secondary | 이름·제목을 Primary, 이메일·ID·상품/기수 보조 식별자를 Secondary로 같은 셀에 배치 가능. 긴 텍스트는 ellipsis와 전체값 접근 수단 제공 |
| Hover / Selected | Hover는 아주 옅은 회색, Selected는 경계/배경+선택 표시로 구별. 행 클릭 가능 여부를 cursor·포커스·키보드 동작으로 알림 |
| Sorting | 실제 지원 열에만 affordance. 선택한 열·오름/내림을 시각·`aria-sort`로 표시. 서버/클라이언트 정렬 범위 명시 |
| Group | 주차/상품 그룹 행은 별도 Subtle 표면과 제목·건수. 실제 데이터 행과 시각적·의미적으로 구별. 이동 순서와 그룹 소속을 섞지 않음 |
| Pagination | 테이블 하단, 현재 `시작–끝 / 총건수`와 페이지 크기·이전/다음. 총건수의 **전체 DB/필터 결과/현재 페이지** 중 정의를 명시 |
| Empty | 데이터 자체 없음 / 현재 필터 결과 없음 / 보관만 있음 / 접근 권한 없음 등을 구분하고 가능한 다음 조치 제공 |
| Loading / Error | 기존 행을 무조건 지우고 빈 상태처럼 보이지 않게 skeleton·진행 표시 사용. 실패는 재시도와 적용된 필터를 유지 |

검색, 필터, 정렬, 내보내기, KPI가 서로 다른 데이터 범위를 쓰는 경우 각 범위를 화면에 표시한다. 감사 P1의 `AdminCatalog` 로컬 `rows` 검색, members 서버 total·현재 list 혼합, orders 기간 Apply 분리는 **컴포넌트 치환으로 해결되지 않는다**. 서버 쿼리/집계 계약과 실데이터 QA가 먼저다. 검토 큐처럼 2-pane이 더 빠른 화면은 DataTable 강제 대상이 아니다.

## 8. Status System

`StatusBadge`는 작은 텍스트+배경+선택적 아이콘의 동일한 높이·padding·radius를 사용한다. 상태 코드는 도메인별로 해석한다. 아래는 목표 매핑이며 현재 `AdminStatusBadge`, 기존 `Badge`, 회원 전용 배지의 색/문구가 다르므로 후속 호환 검증 전 일괄 치환하지 않는다(감사 §9).

| Tone | 의미 / 예시 | 시각 우선순위 |
|---|---|---|
| Error | 결제 실패, 제출 반려, 동기화 실패 | 가장 높음. 실패 사유/복구 CTA 동반 |
| Warning | 검토 필요, 보완 요청, 승인 대기, 설정 누락 | 높음. 처리 큐·기한·다음 액션 동반 |
| Info | 진행 중, 예약, 제출 완료·검토 전이라는 정보 | 중간. “검토 필요”와 문구 구별 |
| Success | 승인 완료, 결제 완료, 공개, 정상 활성 | 낮음. 정상 건보다 예외를 가리지 않음 |
| Neutral | 보관, 비공개, 취소, 비활성 | 낮음. 단, “미션 미설정”은 Warning으로 분리 |

예외 우선순위는 **Error → Warning → Info → Success/Neutral**이다. 같은 제출 코드라도 회원 화면 `submitted`와 공통 `submitted`의 현재 색이 다르므로 “제출 완료(검토 전)”과 “검토 필요”를 업무 의미로 분리한다. “미제출”과 “필수 미션 미설정(0/0)”도 다른 라벨·필터·집계로 취급한다. `검토 필요`를 무조건 브랜드 빨강으로 칠하지 않고 경고 tone, 정렬/Quick Filter, 명확한 CTA로 우선순위를 높인다. 파생 상태(쿠폰 만료·배너 종료 등)는 매핑 누락 시 기본 회색으로 조용히 떨어지지 않도록 도메인 상태표를 후속 단계에서 확인한다.

## 9. Layout Templates

템플릿은 DOM 구조와 정보 순서의 **선택 기준**이며 현재 페이지를 이동시키는 지시가 아니다. Header에는 한 개의 제목, 짧은 설명, 가능하면 현재 경로/breadcrumb 및 한 개의 주 액션을 둔다.

| Template | 정보 순서 | 기본 화면 / 예외 |
|---|---|---|
| LIST | PageHeader → 선택적 Summary → FilterBar → 선택적 QuickFilter → DataTable → Pagination | products·cohorts·weeks·customers. 특수 카드형 학습/미션은 작업 검증 후 판단 |
| FORM | PageHeader → Form Section(관련 필드 묶음·검증) → Sticky Action(취소/저장·미저장 경고) | 상품·학습 편집기. 긴 입력은 섹션/탭으로 나누되 저장 경계를 명시 |
| OPERATION | PageHeader → 범위가 분명한 Summary → Filter → Work Queue → Detail Drawer 또는 2-pane | members·reviews·questions·orders. 큐에서 예외·오래 기다린 건 우선 탐색 |
| DASHBOARD | PageHeader → 기간/대상 필터 → KPI → Charts → Operational Data | admin home·landing·analytics. 지표의 기간·분모·갱신 시각을 KPI 가까이에 표시 |

Navigation/IA 계약: 화면 제목·설명·그룹·breadcrumb·메뉴 선택 상태는 단일 route metadata를 원천으로 삼는 것을 목표로 한다. 감사 §3의 `lib/platform.ts`, 새 navigation, 이전 shell의 병존은 Phase 3에서 호환 계층과 권한별 표시를 확인한 뒤 정리한다. 메뉴 명칭 변경만으로 URL·딥링크·권한을 바꾸지 않는다.

## 10. Modal, Drawer, Page 선택 기준

| 표면 | 사용 대상 | 하지 말 것 |
|---|---|---|
| Modal | 짧은 확인, 삭제/회수 같은 파괴적 결정, 짧은 단일 액션 | 여러 섹션의 생성/편집, 장시간 검토를 넣지 않음 |
| Drawer | 목록 맥락을 보존할 상세, 제출 검토, 적은 필드의 Quick Edit | 복잡한 전체 폼·탭·다단계 업무를 억지로 넣지 않음 |
| Page | 복잡한 Create/Edit, 다단계 설정, 내용 제작 | 단순 확인을 새 페이지로 보내지 않음 |

Modal/Drawer는 열 때 제목으로 포커스를 이동하고 내부 focus 관리, Escape/닫기, 닫은 뒤 원래 행·버튼으로 포커스 복귀, 배경 스크롤 제한을 제공한다. 파괴적 작업은 대상·영향을 문장으로 확인하고 저장 중 중복 실행을 막는다. Drawer 닫기는 필터·페이지·스크롤을 보존한다. 미저장 변경이 있으면 닫기 전에 알린다. 중첩 overlay는 피하고 불가피하면 포커스/레이어 순서를 QA한다.

## 11. Responsive / Interaction Rule

감사에서 확인된 실제 Admin 분기점 `1100px`, `1024px`, `720px`을 존중한다. 문서상의 기본 구간은 **Desktop >1024px / Tablet 721–1024px / Mobile ≤720px**이며 1100px은 KPI·검토 pane 등 개별 화면의 사전 접힘 지점이다. 420px 이하의 KPI 1열도 기존 예외로 유지할 수 있다. 화면별 실측 전 임의 breakpoint를 더하지 않는다.

| 요소 | Desktop | Tablet | Mobile |
|---|---|---|---|
| Sidebar | 224px 고정, 현재 위치 표시 | 공간 부족 시 접기/overlay 검증 | overlay 메뉴, 포커스 순환·복귀 유지 |
| FilterBar | 주요 select + 유연한 search + action 한 줄 우선 | 필요하면 두 줄 wrap; 범위/검색 우선 | select 묶음 → search 전체 폭 → action 순서. 적용 조건을 화면에 남김 |
| Table | 모든 핵심 열, 필요한 경우 sticky header | 낮은 우선 열 숨김 또는 가로 스크롤 | 열을 억지로 압축하지 않음. 주요 식별자·상태·CTA 유지, 나머지는 스크롤/행 상세로 제공 |
| Drawer | 우측 고정폭; 목록 가시성 유지 | viewport에 맞춰 폭 제한 | 전체 폭·100dvh, 명확한 닫기/뒤로 동작 |

탭·QuickFilter는 선택 상태와 건수 범위를 함께 표시하며 키보드로 전환 가능해야 한다. 모든 비동기 액션은 진행/성공/실패 피드백을 제공한다. Toast만으로 영구 오류나 저장 상태를 전달하지 않는다. 정렬·필터·페이지 변경 후 결과 수와 현재 적용 조건을 함께 갱신한다. 상태·날짜·금액은 화면과 내보내기에서 동일한 의미/포맷을 사용한다.

## 12. Phase 3 이행 게이트 — 자동 시작 금지

이 문서는 CSS/token 파일이나 페이지에 자동 적용되지 않는다. 다음 단계가 별도 승인되면 감사 §11의 순서대로 `products`(일반 목록), `orders`(기간/집계), `members`(서버·로컬 범위)의 대표 화면에서 **실제 computed style, 데이터 범위, 권한, URL, CSV, 저장/보관, 키보드/모바일**을 먼저 확인한다. 특히 검색 범위와 KPI 분모는 API 계약 검증 없이는 “디자인 적용 완료”로 보고하지 않는다. 기존 `AdminButton` variant 이름과 신규 목표 variant, `AdminDataTable`/legacy table, `AdminStatusBadge`/member badge는 호환 표를 만든 뒤 점진 전환한다. `reviews`·`learning`·`missions`의 화면 유형은 업무 사용성 테스트 없이 표로 강제하지 않는다.

**이번 Phase의 완료 정의:** 이 문서만 작성하고 종료한다. 페이지 migration, 컴포넌트 생성, CSS 수정, 기능 변경, Phase 3 착수, 배포는 범위 밖이다.
