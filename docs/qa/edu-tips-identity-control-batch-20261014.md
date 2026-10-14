> 최신 결과: 로컬 후보 보완 완료. 전체단위1,448건·관련23건·최종SQL관련12건·타입/변경ESLint/빌드 통과. 외부합의/실제2PG·HTTP 공동 검수/route·publisher·cron·알림UI/운영은 미완료. 이전 설명은 당시 후보의 이력입니다.

# EDU TIPS identity and control candidate — local batch, 2026-10-14

기준: develop fb8867e4e597a26c0e5c564e89293c841c6a218e. 원격 운영/DB 상태를 재확인한 문서가 아닙니다.

대표 요청: 작은 작업마다 전달하지 않고, 독립적으로 진행 가능한 구현·검수를 묶어 한 번 전달합니다. 10/14 협의 초안 ZIP은 아직 보내지 않았으며 HOLD 상태입니다.

## 이번 구현 범위

- 서버 전용 HMAC 고객/사건/결제/환불/학습 번호 생성 후보. 공개 합성 Python 벡터와 일치. 키 누락·짧은 키·목적별 키 재사용·UUID/이메일 대체·잘못된 날짜를 거절합니다. 원래 UUID는 서버 내부 입력이며 외부 번호에 넣지 않습니다.
- 별도 철회 차단 통신 후보. 기본 비활성, 협의 버전과 서버의 정확한 HTTPS origin allowlist·환경·별도 서명 키가 일치해야 통신합니다. 현재 실제 호스트/Secret/환경변수 연결이 없습니다.
- 원래 요청의 bytes·requestId·고객 세대·5/30/30 기한을 유지하고, 매 시도 fresh nonce/시각으로 서명합니다. redirect/cache 금지, JSON 크기/UTC/기한/응답 scope·target·digest 검증, fetch 및 스트림 전체 timeout, 잘못된/부분 성공 응답 차단, 진단/키 원문 미반환.
- 독립 제어 lease worker 어댑터. 삭제 pull의 delivered_at이나 수집 OFF로 재시도를 생략하지 않습니다. blocked 응답을 정확 lease로 저장한 뒤만 confirmed로 보고하며, 삭제 completed/최종 ACK를 쓰지 않습니다. 저장 실패·lease 소실·서명/설정 충돌·시간 경과·bounded retry를 구분합니다.
- 이번 브랜치의 Vercel 자동 배포만 false로 지정합니다. 기존 브랜치 설정·공유 DEV/운영에는 영향 없습니다.

## 연결하지 않은 곳과 필요한 공동 결정

이 파일들은 실제 동의 저장 route/DB trigger/cron에서 import하지 않는 후보입니다. 따라서 고객 번호 발급·즉시 철회 원격 전송·관리자 경보·실제 예약 worker를 배포했다고 보고하지 않습니다.

1. **번호 산식과 기존 난수 이행:** 현행 EDU opaque_refs는 subject별 난수입니다. 같은 활성 cursor에서 HMAC 번호로 바꾸지 않습니다. 원래 사본 삭제·ACK, 고정 ID namespace/producer projector, snapshot 재구성이 먼저 필요합니다. 현재 후보는 HMAC 생성기이며 SQL producer 이행은 미구현입니다.
2. **epoch·등록:** EDU의 consent_epoch 전역 UNIQUE와 고객키 교체 후 기술 세대/법적 동의 증빙 의미를 합의해야 합니다. 현재 등록 RPC 자체를 변경하지 않았으며 실제 생성/등록 route·동시 pending-ID 내구 저장은 미구현입니다. 광고 수신만 바꾼 경우 기존 분석 세대를 보존해야 합니다.
3. **제어 주소/계약:** draft.1 경로·receiver·시각 정밀도·signature/nonce 규칙·5초/60초 목표를 TIPS/MYIN과 확인해야 합니다. 지금 실제 URL이나 운영 SLA로 확정하지 않습니다.
4. **내구 저장/스케줄:** ControlDeliveryStore는 조건부 commit과 별도 제어 큐/lease를 요구하는 인터페이스입니다. 실제 DB 구현·원천 철회와 동일 트랜잭션 enqueue·commit 뒤 dispatch·담당자 경보·범위별 안전 중지는 미구현입니다. 인터페이스 mock 통과가 DB 내구성 증거는 아닙니다.
5. **TIPS 실제 런타임:** 영구 facts·결과 사용 직전 eligibility·늦은 쓰기 fence·물리적 작업 취소·후속 영수증·연속 ACK·미국 Modal/모델/백업 증적은 TIPS 실제 구현·공동 검수가 필요합니다. source 코드 SHA를 TIPS runtime SHA로 대체하지 않습니다.

MYIN 실제 ID 산식과 과거 5/30/5 원기한은 보존합니다. EDU sender는 EDU rc.2 5/30/30만 받습니다. 동봉 공통 schema는 MYIN legacy도 기술할 수 있지만 이를 EDU 요청으로 수락하지 않습니다.

## QA와 실행 경계

- 새 로컬 시험: 10개 test group(독립 crypto 벡터, 입력 거절, 전송 비활성, 정확 목적/환경/호스트, 원본 bytes/nonce, ACK 혼동, timeout/진단 차단, lease/내구 저장 실패·pull 독립 retry).
- 전체 단위 시험: 1,435 통과. TypeScript 통과. 변경 파일 ESLint 오류/경고 0.
- 브라우저 검수: 미실행. UI/페이지/라우트 변경 없음.
- 실제 DB/HTTP 공동 시험·운영/미국/삭제 검수: 미실행. 새 migration 없음, 환경변수/키/고객 전송/발송 변경 없음.
- 로컬 webpack 빌드 통과(외부 환경변수/비밀값 복사 없이 실행). 위 테스트는 실제 서비스 활성화 승인/증거가 아닙니다.

공유 DEV, DB·키·합성 공동 시험, 운영 배포/활성화는 기존 별도 승인 경계를 유지합니다. 한 번의 공동 확인 목록 D1~D5를 규격/QA와 통합해 전달하며 중간 파일은 발송하지 않습니다.

## 후속 묶음 — 내구 저장·등록·정밀 시각 (2026-10-14)

- 새 비활성 SQL 후보 20261014042612_edu_tips_control_delivery_candidate.sql. 설치 시 capture/sending/identity 모두 false, 신규 키·소비자·실제 전송·기존 요청 백필 없음. 별도 대표 승인 없이 실제 DEV/운영 DB에 적용하지 않습니다.
- control_deliveries에 최초 요청·consumer/environment·본문·digest를 고정 저장합니다. 원천 erasure_outbox INSERT와 같은 트랜잭션에서 enqueue(활성화 때만), SKIP LOCKED claim·60초 lease·정확 lease 조건의 blocked 확인/재시도·읽기 전용 attention 조회를 추가했습니다. 기존 delivered_at/completed_at/연속 ACK를 변경하지 않습니다. consumer 변경은 미확인 요청이 있으면 차단합니다.
- pending_identities는 서버가 만든 최초 epoch를 DB에 보존하고 등록 재시도/겹친 요청에 재사용합니다. 광고 수신만 수정한 revision에서는 같은 epoch를 유지합니다. 철회·탈퇴·고지 비활성 시 pending도 retire합니다. 기존 random/HMAC ID를 임의 덮어쓰지 않으며 고객키 변경은 needs_migration으로 돌려줍니다. 완료된 옛 세대만으로 재등록하지 않고, 실제 재동의 증빙이 없으면 identity_migration_required로 보류합니다. 기술 rekey의 수동 승인/epoch 의미는 공동 합의 후입니다.
- 서버 RPC 어댑터는 기본 비활성, 등록·claim·확인·retry를 연결합니다. 전송 실패/DB 응답 오류는 원문을 반환하지 않습니다. 최대20건·동시4건·RPC당5초 제한으로 lease를 오래 점유하는 요청을 제한합니다. 실제 동의 route/cron에는 아직 import하지 않습니다.
- source PostgreSQL microseconds를 밀리초로 자르면 원기한이 바뀔 수 있어 draft control timestamp를 UTC 3자리 또는6자리 소수초로 보완했습니다. BigInt로 정확120/720/720시간을 확인하고 1마이크로초 연장도 거절합니다. JSONB property 순서가 달라도 고정 순서 encoder로 동일한 서명 bytes를 재구성합니다. 정식 v2 schema/기존 MYIN 코드와 산식은 변경하지 않습니다.
- 로컬 PGlite에서 실제 후보 SQL을 실행해 OFF/권한 차단·atomic withdrawal/rollback·B보존·별도 retry·lease/불일치 ACK·immutable snapshot·범위 변경 차단·DB digest/Python-Node 상호운용·pending 동시 요청·광고 revision·철회·고지·rekey 차단을 검수했습니다. Promise 동시 호출은 단일 PGlite 처리이며 실제 두 PostgreSQL connection 경합/장애 내구성 증거는 아닙니다.

남은 실제 연결: source 난수 allocator→HMAC publisher/profile migration과 전체 snapshot 복구, 실제 TIPS URL·서명·시각 정밀도·기술epoch 합의, 동의 저장 뒤 dispatch/cron 및 관리자 알림 UI 연결, 정식 DEV에서 다중 connection/실HTTP/격리복원·receipt/연속 ACK·Modal/모델/백업 공동 증적. 이들 없이 고객별 운영 분석을 활성화하지 않습니다. 최종 통합 파일에는 완료와 미완료를 나누고 공동 확인 항목을 한 목록으로 모읍니다.

### 후속 검수 완료 범위와 미수행
- 로컬 source queue·pending registration SQL/RPC 어댑터와 별도 상태 조회 후보까지 구현했습니다. 새 control_authorities는 과거 요청의 원래 계약·기한 근거가 있을 때만 명시 등록하며, 최신 header나 기한 숫자로 과거 origin을 추정하지 않습니다. 원본 미확인은 unclassified로 보존하고 전송하지 않습니다. 신규 capture는 별도 owner activation 근거가 있어야 가능합니다.
- 최종 관련 시험23개(기존10개+정밀시각/로컬 DB12개), TypeScript·변경 ESLint·로컬 빌드 통과. 전체 최종 단위1,448건 통과(실패0), 마지막 미분류 상태 조회 정정 뒤 관련DB12건 재통과. 단위 결과는 실제 운영 증거가 아닙니다. 앞의1,435/마이그레이션0/DB미구현 설명은 이전 후보6ae9056의 기록입니다.
- Typecheck와 build를 동시에 실행한 한 번은 .next 타입 산출물 교체로 TS6053이 났고, build 완료 후 단독 typecheck 재실행으로 통과했습니다. 코드 결함으로 판정하거나 기존 파일/설정을 삭제하지 않았습니다.
- 실제 Supabase advisors·두 실제 PostgreSQL connection 경합·공동 HTTP·실제 부하·원격 서버 장애·Modal/model/backup은 미검수입니다. 원격 DB/환경변수/Secret/공유DEV/운영 변경0. candidate migration은 파일 생성+로컬 PGlite 실행만 했습니다.
