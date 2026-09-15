# BUGFIX 결과 — 클래스 진입 및 무료클래스 트래킹

## 상태 요약

전체 상태는 **PARTIAL**이다. 이번 코드 변경은 1번의 로딩 안내에만 한정한다. 모바일 CTA, 집계 숫자, 설정 저장을 수정 완료로 보고하지 않는다. 운영 반영 및 QA 최종 PASS는 하지 않았다.

| BUG ID | 사용자 항목 | 심각도 | 상태 |
| --- | --- | --- | --- |
| BA-CLASS-LOAD-001 | 1. 오류처럼 보이는 초기 로딩 | S2 | PARTIAL: UI 수정·자체 테스트 완료, 실측 속도·브라우저 QA 대기 |
| BA-CLASS-MOBILE-CTA-001 | 2. 모바일 본문 CTA 클릭 불가 | S2 | BLOCKED: 모바일 재현 불가, 원인 미확정 |
| BA-TRACKING-COUNT-001 | 3. 방문 집계 불일치 | S2 | BLOCKED: 조회 제외 조건 확인, 실제 Row 대조 불가 |
| BA-CAMPAIGN-SAVE-001 | 4. 캠페인 저장 후 초기화 | S2 | BLOCKED: 저장 Payload·Response·Row 대조 필요 |
| BA-CAMPAIGN-SCOPE-001 | 5. 광고·오가닉 복수 UTM 조회 | S2 | NOT FIXED: 조회 범위 제약 확인, DB 검증 및 범위 설계 필요 |

## 확인 환경

- Repository: `brandyaction-ricky/brandyaction-edu`
- 운영 URL: `https://brandyaction-edu.com/classes/product-cf6fb7a4-6eb9-41ea-a27a-02201bf07d1b`
- 운영 배포: `dpl_47MGvGybCuvTAXsA1ETfXrpW82WM`, READY
- 운영 Commit: `091efbe247f14c4a100b29afca9ac6e174f3dfa4`, main
- 수정 기준: develop `682b4f0528c6d92f5bede2a616f03a50a4cb2821`
- 수정 Branch: `fix/class-entry-cta-20260915`
- 대상 공개 클래스: `AI 직원 생성하기`, course ID `ee095fb0-8e69-4d08-aa96-95c4f7e4a6cf`
- 공개 HTTP 요청은 비로그인으로 수행. 관리자 세션 및 모바일 기기 미확보.
- 브라우저 연결은 탭 생성·목록 조회에서 `CDP operation refresh tabs timed out after 20000ms`로 실패했다. 실제 브라우저 재현율은 미측정이다.
- 연결된 Supabase 프로젝트 목록에 EDU 프로젝트 `vjmjhaidlqkmascdjocw`가 없다. 다른 프로젝트를 조회하거나 자격증명을 우회 추출하지 않았다.
- 별도 기존 worktree의 미커밋 변경은 건드리지 않았다.

## BA-CLASS-LOAD-001

### 문제와 Root Cause

확인됨: `Platform`은 `/api/platform` 응답 전 `loading=true`, `data={}` 상태이다. 이때 선택한 클래스를 아직 찾을 수 없어 일반 fallback으로 진입한다. 기존 fallback은 로딩 문구와 함께 항상 [홈으로]를 렌더링했다. 데이터 요청이 실패해도 ‘페이지를 찾을 수 없습니다’가 표시되어 일시적인 연결 실패와 실제 미존재가 혼동됐다.

계층: **Frontend Logic / 렌더링 상태 분기**. UI 혼동의 원인은 확정했다. 네트워크 지연의 근본 원인은 확정하지 않았다.

### 재현과 수정

초기 렌더링 및 요청 실패 상태를 자동 테스트로 재현했다. 수정 전 4개 중 2개가 실패했으며 기존 HTML에서 로딩 문구와 [홈으로] 동시 노출을 확인했다.

- 로딩 전용 상태: 원형 회전 표시, ‘곧 열립니다’, 대기 안내.
- 로딩 중 [홈으로] 제거.
- 오류 시 기존 [다시 시도] 유지, 미존재로 잘못 안내하지 않음.
- 정상 응답에 클래스가 없는 경우만 미존재 안내와 [홈으로] 유지.
- 스크린리더 상태 안내 및 모션 줄이기 설정 지원.
- 인증·API·결제·본문 HTML·CTA 동작에는 변경 없음.

### 로딩 시간과 성능 조사

공개 HTTP 진단 1회씩:

| 요청 | HTTP | TTFB | 전체 응답 완료 | 응답 크기 |
| --- | --- | --- | --- | --- |
| 대상 클래스 URL | 200 | 14.989초 | 15.294초 | 15,138 bytes |
| `/api/platform` | 200 | 14.516초 | 15.113초 | 1,331,272 bytes |

**이 숫자는 조사 환경의 네트워크/프록시를 포함한 개별 HTTP 요청 시간이다. 사용자의 로딩 화면 지속 시간으로 해석하거나 합산해서는 안 된다.** 실제 초기 표시→본문 표시 시간, 모바일 중앙값·P95는 아직 측정하지 못했다.

확인됨: 공개 데이터의 `detail_html_document`가 1,295,979자이며, 공개 데이터 응답 대부분을 차지한다. 클래스 화면도 전체 공개 플랫폼 조회를 기다린다. 메타데이터 조회도 `title,summary,metadata` 전체를 요청한다.

후속 조사 후보: 브라우저 네트워크 waterfall, 서버 처리 시간, 상세 HTML 전송량, 클래스별 조회 범위 및 SEO용 metadata projection. 아직 최적화하거나 단축 효과를 검증한 것은 아니다. 스피너 추가를 성능 문제 해결로 처리하지 않는다.

## BA-CLASS-MOBILE-CTA-001

확인됨: 실제 저장된 HTML의 본문 CTA는 `https://open.kakao.com/o/g4k24OMi`를 가리키는 링크다. 업로드 HTML은 sandbox iframe에 표시된다. 부모 핸들러가 링크 기본 동작을 취소한 뒤 CTA 이벤트를 전달하고 `window.open(..., '_blank', 'noopener,noreferrer')`을 호출한다. 플로팅 CTA는 부모 페이지의 일반 링크를 사용한다.

추정: 모바일/인앱 브라우저의 새 창 제한 또는 iframe 클릭 전달 문제가 후보다. 현재 증거만으로 어느 것인지 확정할 수 없다. 재현 전 핸들러 교체, sandbox 완화, 인증 우회는 하지 않았다.

별도 발견: iframe에서 전달한 `PRODUCT_CTA_EVENT`는 제품 픽셀에서 받지만 `startLandingTracking`의 본문 클릭 집계는 `a[data-landing-cta]`만 대상으로 한다. 이는 본문 CTA 자체 집계의 별도 확인 항목이며, 페이지 방문 13건의 원인과 동일시하지 않는다.

## BA-TRACKING-COUNT-001 / BA-CAMPAIGN-SCOPE-001

사용자 제보 시간: 2026-09-15 06:00–08:21 KST = 2026-09-14 21:00–23:21 UTC.

확인됨:

- 운영 `edu_marketing_dashboard` 및 CSV 조회 SQL에는 `coalesce(utm_campaign,'') in (선택한 캠페인의 utm_campaign,'')` 조건이 있다.
- develop의 추가 집계 조회에도 같은 제한이 있다.
- 따라서 설정값이 아닌 다른 **비어 있지 않은 UTM campaign**은 필터를 선택하기 전부터 제외된다. UTM 없는 직접 유입은 포함된다.
- 다중 선택 UI만 추가해도 이 선행 조건에 의해 제외된 방문은 복원되지 않는다.
- 대상 공개 `landing_configs`는 `enabled=true`, `layout_ver=1`이다.
- Vercel 해당 시간대 조회에는 `/api/landing/events` 204 응답이 다수 존재한다. 집계 응답은 204 999건을 표시했으나 상위 결과 제한이 있으므로 전체 요청 수로 쓰지 않는다. heartbeat/section 이벤트도 포함되므로 방문자 수로 환산하지 않는다. 테스트 모드에서도 204를 반환하므로 Row 저장의 증거로 간주하지 않는다.
- 조회한 로그 범위의 `/api/landing/` 4xx·5xx 필터는 빈 결과였다. 이것만으로 수집 누락 없음 또는 모든 저장 성공을 보장하지 않는다.

미확인: 13건의 실제 구성, 광고 UTM별 수집 Row, 테스트 쿠키 영향, RPC/migration 실제 적용 상태, DB 저장 후 조회에서 제외된 수. 카카오 입장 인원·Meta 전환·사이트 방문은 정의가 달라 단순히 같은 값으로 맞추면 안 된다.

필요 조치: 실제 UTM별 저장 데이터를 먼저 대조하고, 광고/오가닉을 포함할 캠페인 연결 범위를 확정한 뒤 대시보드·추가 집계·CSV에 일관되게 적용한다. 복수 UTM 연결 방식과 분류 UX 확장은 필요 시 `01_SPEC → 02_DEV`로 분리한다. 기존 데이터 수정·삭제·migration 적용은 하지 않았다.

## BA-CAMPAIGN-SAVE-001

확인됨:

- 운영 API의 campaign 저장 분기는 입력 검증 후 `landing_campaigns.update(...).eq('id', ...).select('*').single()`을 수행하고 저장한 Row를 응답한다.
- 해당 시간대 로그에 `/api/landing/performance` POST 200과 후속 GET 200이 존재한다. 로그는 action/Payload/Response 내용을 포함하지 않아 해당 요청이 캠페인 저장인지 또는 원하는 필드가 저장됐는지는 알 수 없다.
- 운영과 develop의 설정 UI/API가 다르다. develop에는 이미 공통 Meta 광고계정 및 분리된 설정 화면 작업이 있으므로 운영 증상을 develop에서도 재현해야 한다.

Root Cause 미확정. 입력 Payload → POST Response → 동일 campaign ID의 Row → 새 GET Response → UI 값 순으로 대조해야 한다. 새로고침 후 초기화라는 증상만으로 RLS나 저장 API를 추측 수정하지 않았다.

## 변경 파일 / DB 변경 / 자체 테스트

- `app/ui/platform.tsx`: 로딩·연결 오류·미존재 분리.
- `app/ui/final/integration.css`: 로딩 표시의 범위 제한 CSS.
- `tests/class-entry-loading.test.mjs`: 4개 렌더링 회귀 테스트.
- 본 문서: 결과 및 QA 인계.
- DB 변경: **없음**. 운영 데이터·환경변수·RLS·Storage 변경 없음.
- `npm test`: **153/153 통과**.
- `npx tsc --noEmit`: 통과.
- 변경 TSX/테스트 대상 ESLint: 통과.
- `npm run build`: 통과.
- `git diff --check`: 통과.
- 미수행: 실제 브라우저 UI 검증, 모바일 인앱 CTA, 실제 DB 저장·집계 검증, 실제 로딩 시간 비교.

## 03_QA 재검증 요청서

### BUG ID / 수정 대상

`BA-CLASS-LOAD-001`: 클래스 상세 초기 로딩 안내. 다른 4개 항목은 수정 완료 대상으로 넘기지 않는다.

### 기존 증상 / Root Cause / 수정 내용

데이터 미도착 상태에 미존재 화면의 [홈으로]를 노출했다. 로딩 전용 상태와 요청 실패·정상 응답의 미존재 상태를 분리했다.

### 테스트 환경

- DEV: `https://brandyaction-edu-dev.vercel.app/classes/product-cf6fb7a4-6eb9-41ea-a27a-02201bf07d1b?testmode=1`
- Branch: develop, 이 문서를 포함한 PR의 merge commit 기준. 정확한 SHA와 배포 READY 여부는 BUGFIX 최종 인계에 기록한다.
- QA 전 DEV alias가 해당 SHA를 가리키는지 확인한다.
- 브라우저: 데스크톱 Chrome, iOS Safari, Android Chrome, 광고 유입용 Instagram/Facebook 인앱.
- `testmode=1`은 픽셀/방문 수집 검증에 사용하지 않는다. 집계 테스트는 별도 승인된 DEV 데이터/테스트 캠페인에서 수행한다.

### 재현 절차와 기대 결과

1. 캐시가 없는 상태에서 DEV 대상 URL 직접 진입. 느린 네트워크에서도 본문 준비 전 원형 표시와 ‘곧 열립니다’가 보이고 본문 안내에 [홈으로]가 없어야 한다.
2. 데이터 응답이 완료되면 로딩 표시가 사라지고 동일 클래스 본문·기존 플로팅 CTA가 보여야 한다.
3. 모션 줄이기를 켜면 회전 없이 대기 상태를 읽을 수 있어야 한다. 키보드·스크린리더 안내 확인.
4. 요청 실패 상황에서는 미존재로 안내하지 않고 [다시 시도]로 복구할 수 있어야 한다.
5. 정상 응답에 존재하지 않는 클래스는 미존재 안내와 [홈으로]를 보여야 한다.

### 회귀 테스트 범위

무료·유료 클래스 상세, 클래스 목록, 로그인/관리자 권한 안내, API 재시도, 헤더/푸터 및 본문/플로팅 CTA. 실제 CSS 여백·회전·모바일 overflow는 브라우저에서 확인한다.

### 추가 확인사항 — 2·3·4·5번 원인 분석 재개 조건

- 모바일: 기기/OS/브라우저를 기록하고 본문 CTA 탭 전후 click 이벤트, popup 차단 메시지, 최종 URL, 플로팅 CTA와의 차이를 확보한다. 데스크톱과 각 모바일 브라우저에서 5회씩 재현율 기록.
- 속도: 같은 기기/네트워크에서 cold/warm 각 5회 이상, navigation 시작·로딩 표시 시작·API 완료·본문 표시·CTA 동작 가능 시점을 구분한다.
- 집계: 제보 KST 시간 구간의 `funnel_sessions`를 landing ID/UTM별 집계해 수집 총합과 대시보드 제외분을 대조한다. 원시 개인 식별자는 보고서에 싣지 않는다.
- 저장: 같은 캠페인에서 세 필드의 입력→POST→DB→GET→UI를 대조하고, 다른 캠페인으로 선택이 바뀌는지 확인한다. 운영 테스트 쓰기 대신 승인된 DEV 데이터를 사용한다.
- 복수 UTM: 광고 A, 오가닉 B, UTM 없음, 한글/인코딩 UTM, 서로 다른 소재의 포함/제외 기준을 먼저 확정한다. 총합·일별 추이·소재별 성과·CSV가 일치해야 한다.

BUGFIX는 최종 PASS하지 않는다. QA PASS 전 `05_RELEASE` 후보 확정 금지. 이번 로딩 UI 변경만 운영으로 선별 반영하려면 기존 develop의 다른 트래킹 변경을 포함하지 않도록 RELEASE에서 Diff를 검토해야 한다.
