# Admin Design System Phase 0·1 QA 요청서

## QA 대상

BrandyAction EDU Admin Design System 공통 기반과 무료클래스 트래킹 기준 화면.

## 구현 목적

관리자 전용 Layout, Typography, Form, Table, Toolbar, Drawer, 상태 표현을 공통화하고, `/admin/landing`에서 실제 사용성과 반응형 동작을 검증한다.

## 변경 내용

- 관리자 scope 전용 token과 wide/standard/narrow content width를 추가했다.
- Layout, Control, Data, Overlay 공통 Component를 추가했다.
- 무료클래스 트래킹을 Page Header, compact 조회 Toolbar, 8 KPI, 소재 성과표, 일별 추이, 통합 실측 Grid, 설정 Drawer 순서로 재구성했다.
- 기존 큰 화면별 버튼·입력·카드·표·Modal·Error·Empty·Skeleton CSS를 공통 Component로 대체했다.
- 캠페인 설정과 Meta 동기화는 Right Drawer로 이동했다.
- 실측 추가·수정 Drawer와 미저장 이탈 확인을 유지했다.
- `/admin/metrics`의 `/admin/landing?tab=actuals` 호환 redirect 및 조회 query를 유지했다.

## 테스트 환경

- Branch: `develop`
- 구현 commit: `54a0bcb5c8a97d6b0eb7c7bcb00ec2ba0ccbe114`
- DEV URL: `https://brandyaction-edu-dev.vercel.app/admin/landing`
- Vercel deployment: `dpl_2XXbWTbPGMFHZQ1wE7eQmpvmjd3c` · READY
- DB Migration: 없음

## DEV 자체 검증

- TypeScript: `npx tsc --noEmit` 통과
- 전체 자동화 테스트: 165개 통과
- ESLint: 오류 0건, 기존 `<img>` 최적화 경고 15건
- Production build: Next.js 16.3.0 build 통과
- DEV Desktop: Sidebar 224px, Topbar 64px, 8 KPI 4×2, 문서 가로 overflow 0 확인
- Drawer: 설정 640px, 실측 520px, Escape 닫기·focus 복귀·body scroll lock 확인
- 호환 route: `/admin/metrics` query 보존과 통합 실측 영역 scroll 확인
- 모바일: 720px 이하 2열 KPI, 전체 화면 Drawer, 44px control, 표 horizontal scroll을 자동화된 CSS contract test로 확인

## 필수 테스트 시나리오

1. 관리자 Sidebar가 224px이고 기존 권한별 메뉴 노출이 유지되는지 확인한다.
2. Desktop에서 wide 콘텐츠가 최대 1,440px, Tablet gutter 24px, Mobile gutter 16px로 표시되는지 확인한다.
3. 무료클래스·캠페인 선택, 오늘·어제·7일·14일·캠페인 전체·직접 기간 조회를 확인한다.
4. 비교 모드 A/B 기간과 KPI·차트 값이 같은 필터 조건으로 갱신되는지 확인한다.
5. 8개 KPI가 고유 방문자, 전체 방문, 두 전환율, 두 클릭 지표, 매출, ROAS로 구분되는지 확인한다.
6. 소재 성과표의 정렬, 긴 값 tooltip, numeric 정렬, sticky header·식별 열을 확인한다.
7. 상세 필터 다중 선택·chip 삭제·전체 초기화와 CSV 결과 일치를 확인한다.
8. 일별 추이 지표 토글, 비교 선, tooltip, 정확한 수치 표를 확인한다.
9. 실측 추가·수정·부분 저장·숫자 0 저장·값 비우기·취소를 확인한다.
10. 캠페인 설정 Drawer의 가격 snapshot 안내, Meta ID 저장, 재동기화 상태를 확인한다.
11. 설정 미저장 상태에서 Drawer 닫기·클래스/캠페인 변경·새로고침 시 확인창을 검증한다.
12. Drawer에서 Tab focus가 밖으로 이탈하지 않고 Escape로 닫히며, 닫힌 뒤 실행 버튼으로 focus가 복귀하는지 확인한다.
13. 모바일에서 8 KPI가 2열, 표가 가로 scroll, Drawer가 전체 화면, control touch target이 44px 이상인지 확인한다.
14. 캠페인 미등록, 방문 없음, 실측 없음, 필터 결과 없음, 지역별 조회 오류 상태가 구분되는지 확인한다.
15. `not_configured` 등 내부 상태값이 노출되지 않는지 확인한다.
16. `/admin/metrics` 접근 시 query를 유지하고 통합 실측 영역으로 이동하는지 확인한다.

## 회귀 테스트 대상

- 무료클래스 방문·고유 방문자·CTA·체류·스크롤 수집
- UTM 및 소재별 분류
- 방문자 기준·방문 기준 전환율
- 기간 비교와 CSV export
- 실측 부분 저장과 가격 snapshot
- Meta 계정·복수 캠페인 ID 저장 및 재동기화
- 관리자 권한 검사와 일반 회원 접근 차단
- Sidebar, Topbar, 모바일 navigation
- 사용자용 랜딩·상품·학습 화면 CSS

## 권한 테스트

- `marketing`: 조회, CSV, 실측 저장 가능; 캠페인 설정은 읽기 전용
- `admin`: 모든 조회·실측·캠페인·Meta 설정 가능
- 일반 회원·비회원: 관리자 화면과 API 접근 불가
- 세션 만료·일시적 Auth 장애: 로그인 필요와 재시도 가능 오류를 구분

## 데이터 테스트

- 방문·Meta·실측 데이터가 모두 있는 캠페인
- Meta 미연동 캠페인
- 방문 또는 실측이 없는 캠페인
- 이전 비교 기간이 비어 있는 캠페인
- UTM이 긴 값과 URL 인코딩 값을 포함한 데이터
- 기존 0과 null 실측값이 함께 있는 날짜

## 예상 결과

조회와 저장 결과는 기존 API와 동일하며 화면만 공통 규격으로 정돈된다. `0`, `—`, `계산 불가`, `설정 필요`가 각각 구분되고, Desktop·Tablet·Mobile에서 핵심 조회·입력·설정 동작을 완료할 수 있다.

## 알려진 제약

Phase 2 이후 관리자 화면은 아직 새 공통 Component로 전환하지 않았다. Phase 1 QA PASS 뒤 메뉴군별로 적용한다.
