# 무료클래스 랜딩 트래킹 v4

2026-09-12 · DEV 구현

## 적용 위치

- 관리자: `/admin/landing` → 대상 무료클래스 선택.
- 랜딩·Pixel 설정: 오픈채팅 주소, CTA, Pixel ID, 기본 조회 기간, 기준값, 섹션, 발행 메모.
- 공개 페이지: 기존 `/classes/{slug}`. 활성화한 설정에 오픈채팅 주소가 있으면 캠페인 화면을 사용한다.
- 캠페인 활성화에 필요한 실제 Pixel ID / 카카오 주소는 현재 제공되지 않았다. 값을 만들어 넣지 않는다.
- 지정 무료클래스 이외의 결제·수강 경로는 기존 방식으로 운영한다.

## 요청서 대응

| 요구 | 구현 |
| --- | --- |
| 세션·방문자·최초 UTM | sessionStorage UUID / 1년 localStorage UUID / 최초 5종 raw UTM·referrer origin |
| 섹션 노출·체류 | DOM data-section 자동 관찰, 세션·버전별 1행, 누적 체류시간 최댓값 갱신 |
| 긴 이미지 섹션 | 섹션과 뷰포트 중 작은 높이의 50% 노출 기준 |
| 전송 | sendBeacon 우선, 실패·미지원 시 fetch keepalive, 이동 비차단 |
| CTA | hero_cta / sticky_cta / final_cta, 현재 섹션·스크롤 비율 |
| 이동 실패 의심 | 클릭 후 설정 시간 내 페이지가 숨겨지지 않고 계속 보이면 1회 기록 |
| 테스트 모드 | testmode=1 / testmode=0, 1년 쿠키, 서버 저장 차단 및 Pixel 차단·상단 띠 |
| Pixel | 관리자 설정, 비동기 스크립트, PageView / CompleteRegistration, content_name / content_category |
| 섹션 발행 | 순서·내용·CTA 변경 시 자동 버전 증가, immutable snapshot, 충돌 시 409 |
| 관리자 성과 | 광고세트·소재·섹션 표, 교차표, CTA·클릭 섹션, 일자 추이와 변경선, 기기·브라우저·재방문 |
| 버전 비교 | 같은 필터로 두 버전의 섹션 위치·도달·이탈 비교 |
| 실측 입력 | 누적 입장·당일 퇴장·최대 동시시청·당일 결제 |
| Meta 수치 | 요청서 허용안인 날짜별·소재별 수동 입력. 자동 API는 이번 범위에서 미활성 |
| CAPI | 선택 기능으로 미적용. 브라우저 eventID는 확장 가능하게 유지 |
| 이미지 | 섹션 파일 업로드 시 WEBP 변환, 최대 가로 2000px, 첫 화면 밖 lazy loading |
| 권한 | 기존 관리자·마케팅 스태프 권한 사용. 공개 비밀번호 도입 없음 |

## 집계 해석

- 클릭수는 반복 클릭 포함, CTA 클릭률은 클릭한 세션 / 전체 세션. 위너 최소 클릭 조건도 클릭 세션을 쓴다.
- 카카오 누적 입장: 기간 내 최신 입력값. 퇴장·결제: 기간 합계. 라이브 최대 동시시청: 기간 최댓값.
- null(미입력)과 0은 구분한다. 외부 실측은 캠페인/세트/소재/유입 필터를 적용한 퍼널에서는 표시하지 않는다.
- 같은 탭에서 서로 다른 구성 버전을 보았다면 각 버전에 관측 1건씩 남는다. 전체 퍼널은 이 관측 합계임을 화면에 표시한다.
- 섹션·소재·환경 지표는 버전별로 구분한다. 캠페인/세트/소재 이름은 수집된 값에서 자동 생성한다.
- Meta CTR은 해당 버전이 관측된 날짜의 수기 데이터다. 같은 날짜의 버전 간 광고비·노출을 정확히 배분할 수 없으므로 참고값임을 표시한다.
- '이동 실패 의심'은 카카오 입장 확인이 아니다. 앱 전환/사용자 행동의 영향을 받는다.
- 링크클릭과 세션 갭은 속도·차단·반복 클릭 등의 점검 신호이지 속도 문제가 확정된 지표가 아니다.
- 데이터가 적으면 보류, CTA 하한 미설정 시 임의 저성과 판정을 하지 않는다.
- KST 날짜 범위를 UTC 경계로 변환해 DB 조회하며, 그래프 날짜는 KST 변환 후 사용한다.

## 데이터와 권한

`landing_configs`, `section_snapshots`, `funnel_visitors`, `funnel_sessions`, `funnel_events`, `landing_actuals`, `landing_meta_daily`.

모든 테이블은 RLS 사용, anon/authenticated 직접 접근 금지, API의 권한 검사 후 서버 자격으로만 접근한다. 집계 뷰는 security_invoker이다. DB 함수 역시 security invoker이며 서비스 역할에만 실행을 허용한다.

이벤트 수집 시 요약 세션을 트랜잭션 내에서 잠가 중복·동시 전송을 처리한다. 대시보드는 raw 이벤트 대신 요약 세션과 DB 집계 결과만 조회한다. 공개 페이지는 집계 RPC를 호출하지 않는다.

상품 내용은 랜딩 발행 시 함께 스냅샷으로 고정된다. 상품을 편집한 후 캠페인에도 적용하려면 랜딩 설정에서 변경 메모와 함께 다시 발행한다.

## 검증과 실사용 준비

- `npm test`: 70개 통과. 파싱·KST 경계·검증·CSRF·관리자 권한·테스트 모드·기존 기능 회귀.
- `npm run lint`: 오류 0개, 기존 이미지 및 랜딩 이미지 권고 경고 13개.
- `tests/landing-database.sql`: migration + 테스트를 BEGIN/ROLLBACK 안에서 실행. 중복, 지연 도착 체류시간, 재방문, 버전, 필터, 권한 확인.
- 실제 광고 Pixel ID와 카카오 오픈채팅 주소를 설정해야 광고 플랫폼 수신과 실제 입장까지 확인할 수 있다.
- Instagram/Facebook 앱에서의 실제 카카오 전환은 휴대폰 실기기에서 별도 확인해야 한다. 브라우저 자동화의 UA 테스트가 이를 대체하지 않는다.
- 광고 관리자 UTM: `utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}`.
- 내부 검수는 각 브라우저에서 `?testmode=1`로 시작한다.

참고: [Meta Pixel 전환 추적](https://developers.facebook.com/documentation/meta-pixel/implementation/conversion-tracking), [특정 Pixel 전송](https://developers.facebook.com/ads/blog/post/v2/2017/11/28/event-tracking-with-multiple-pixels-tracksingle/), [Supabase 함수 권한](https://supabase.com/docs/guides/database/functions).
