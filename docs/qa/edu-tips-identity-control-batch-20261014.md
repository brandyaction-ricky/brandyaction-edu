# 최신 — EDU HMAC 발행 연결·전환 장벽·관리자 상태 후보 (2026-10-14)

현재 단계: 에듀 독립 구현 로컬 QA 완료 / 정식 TIPS rc.2 보존, identity/control draft.1 미합의.

서버가 현재 원천 UUID로 HMAC 번호를 만든 뒤 검증된 lease·자료 revision·동의에 묶어 원자적으로 저장/발행하도록 연결했습니다. 비밀키는 DB나 외부 payload로 보내지 않습니다. 기존 난수 allocator의 정확 설치 projector를 별도 내부 함수로 복사하고 기존 capture_member OID는 유지했습니다. 기존 상품 대소문자·TTL 정정·REST safeupdates·학습 분모 null 규칙을 그대로 재사용합니다.

- SQL 20261014062210_edu_tips_hmac_projection_candidate.sql은 로컬 파일이며 실제 DB 미적용입니다. hmac 설정 기본OFF, 실제 key/consumer/회원 seed 없음. 새 hmac_subjects에 profile·record key version·목적별 fingerprint를 고정합니다. 기존 subject/ref를 덮어쓰거나 기술 rekey를 자동 승인하지 않습니다.
- 신규 HMAC 등록은 별도 prepare/finish RPC만 사용합니다. old subject가 있으면 기존 번호/산식을 보존하며 migration_required로 보류합니다. 과거 요청의 원삭제 완료·모든 기록된 소비자의 완료/연속 ACK가 있어야 다음 세대를 허용하고, 원래 실제 선택 동의 receipt 검사도 유지합니다. 기술 세대와 법적 동의 증빙의 별도 이행 권위는 아직 합의/구현하지 않았으므로 자동 재동의를 만들지 않습니다. 테스트의 합성 완료 fixture는 실제 삭제 증거가 아닙니다.
- 결제/환불/학습 저장은 HMAC 계산을 기다리지 않고 동일 트랜잭션에 projection job과 자료 준비 보류만 남깁니다. SQL private claim은 source UUID/날짜만 서버에 전달합니다. 서버는 목적별 key fingerprint를 확인하고 정확 descriptor를 HMAC으로 변환합니다. apply는 현재 subject/동의·lease/revision·profile/key pin·정확한 전체 ref 집합을 재검사합니다. 누락/중복/타 고객/변경 source/철회/키 불일치에서는 발행하지 않습니다.
- 완료 전 public feed/recovery는 정상 빈 snapshot이나 오래된 자료를 반환하지 않습니다. 완성한 자료만 기존 outbox/fact_versions/publish sequence로 발행합니다. 같은 금액의 부분환불은 별도 ID, 원결제 정정은 같은 ID+revision, 학습은 member/cohort/KST일자별 같은 ID를 유지합니다. 원래 expiry는 늘리지 않습니다.
- profile ON/OFF·key 설정 이동은 serving을 끄고 feed generation을 올려 옛 cursor의 조용한 연속 사용을 막습니다. 재개하려면 owner가 별도로 serving을 켜고 새 snapshot을 대조해야 합니다. 값 변경만으로 TIPS 계약을 자동 승격하지 않습니다. 철회/회원 hard delete는 pending job을 취소하고 member 연결을 지우되 원 customer/epoch·삭제 원장·refs를 보존합니다.
- source runtime의 등록 뒤 projection worker를 연결했습니다. publisher·registration·withdrawal은 독립 기본OFF이며 Cron 인증·목적별 키 분리·환경/profile pin 검사를 유지합니다. 새 env는 EDU_TIPS_HMAC_PUBLISHER_ENABLED, EDU_TIPS_RECORD_KEY_VERSION, EDU_TIPS_SOURCE_STATUS_ENABLED이며 실제 값/키를 등록하지 않았습니다. cron schedule도 추가하지 않습니다.
- 관리자 회원 화면에 연결 대기/확인 필요 notice를 준비했습니다. 읽기 전용 관리자 API는 role을 확인하고 건수만 반환합니다. 활성화 전 hide, 권한 없는 응답 hide, 자료 준비/철회 확인과 실제 삭제 완료를 구분합니다. 읽기 자체가 승인·발송·재시도 실행을 하지 않습니다.

검수: 최종 전체단위1,471 통과·실패0, 관련47 통과, 타입·변경ESLint 오류/경고0·로컬 webpack build 통과. 마지막 SQL index/FK/전환 장벽 변경 이후 관련·전체 단위를 재실행했습니다. PGlite 실제 SQL/RPC+Node HMAC 및 mock HTTP/Next route에서 결제·부분환불·학습/정정·복구·pending/lease 응답유실·철회·다른 고객 보존·연속 ACK 장벽·source 불일치 rollback·키 pin·hard delete를 확인했습니다. 단일 PGlite 스케줄은 실제 두 PostgreSQL connection 경합/운영 성능 증거가 아닙니다.
관리자 notice는 SSR 테스트와 별도 헤드리스 HTML 렌더로 390px/1024px 무가로넘침·문구/경보 role을 확인했습니다. 실제 로그인된 DEV 회원 화면 전체 E2E/공동 HTTP는 미실행. 처음 local Chromium은 sandbox MachPort 권한 오류, 격리 합성 HTML만 권한 확장 재실행으로 성공했습니다. CLI migration new도 local telemetry 권한 때문에 재실행했으며 DB 적용/연결은 없었습니다.

실행 경계: 같은 격리 codex 브랜치/Draft PR447, 자동 Vercel 배포false. 공유DEV/운영/원격SQL·환경변수·실제키/고객별전송·발송·MYIN repo 변경0. 새 SHA CI는 별도 확인하며 이전 후보 성공을 승계하지 않습니다. 정식 EDU schema ba95...·MYIN34파일 보존, 후보와 정식 계약을 구분한 통합 파일 하나로 정리합니다.

이후 조건: D1/D2/D4 profile·이행/epoch/서명 의미 합의, TIPS 실제 정식 DEV receiver/runtimeSHA·목적별 Secret/kid와 영구 원장·block commit 준비, 별도 승인 후 실제 DEV SQL/키/합성 A/B·두 PG/HTTP·원격 철회 경쟁/receipt/연속 ACK/복원 공동 검수. Modal 미국 실행/미잔류·모델/백업 전체 삭제 증거와 운영 code/DB/활성화 승인은 여전히 별도입니다. 이 독립 batch가 전체 운영 고객별 v2 완료는 아닙니다.

---

## 이전 — 저장 후 source runtime 연결 후보 이력

# 최신 — EDU 동의 저장·등록·철회 runtime 연결 후보 (2026-10-14)

현재 단계: DEV 후보 / 정식 rc.2 보존, 새 identity/control은 미합의 draft.1.

이번 묶음에서 실제 consent PUT 저장 성공 후 Next after()를 통해 인증된 회원의 등록 작업과 별도 철회 큐를 시도하도록 연결했습니다. GET·인증/출처/입력/DB 실패에서는 실행하지 않습니다. 후속 작업이나 after 스케줄 실패가 저장 성공 응답을 뒤집지 않습니다. 클라이언트가 회원/customer/epoch를 지정하지 못합니다.

- SQL 20261014054801_edu_tips_identity_jobs_candidate.sql: 성공한 현재 분석·해외 동의와 등록 대기 작업이 같은 트랜잭션으로 남습니다. 설치 기본값은 이전 identity_enabled=false이며 기존 회원 백필이나 키 등록은 없습니다. SKIP LOCKED·60초 lease·정확 revision/lease CAS, 장애 재시도, 철회·탈퇴·내부/관리자 전환 취소와 완료 시 실제 subject/현재 동의 재확인을 추가했습니다. 브라우저 역할은 대기 큐 및 RPC에 접근할 수 없습니다.
- /api/cron/tips-source-candidate: callback 유실/등록·통신 실패를 복구할 독립 worker 경로입니다. GET만 허용하고 HEAD는405, 기본OFF, Cron 인증·환경·목적별 키·정확 host/profile/version을 검사합니다. 응답은 운영 건수만 반환합니다. **Vercel 예약 일정은 추가하지 않았습니다.**
- 분석 수집·번호 등록 OFF 또는 번호 설정 오류가 별도로 유효한 철회 통신을 막지 않게 분리했습니다. 부적절한 설정은 cron503으로 남기면서 유효한 철회는 처리합니다. 정확 blocked 확인만 저장하며 erasure completed/최종 ACK로 승격하지 않습니다.
- 목적별 HMAC 키는 서버 Secret만 사용하고 SQL로 전달하지 않습니다. 새 runtime 기본OFF, 실제 origin/kid/consumer/Secret 미등록. EDU_TIPS_HMAC_PUBLISHER_READY는 **활성화 사전 조건을 나타내는 운영자 gate이며 publisher 구현/이행 증거가 아닙니다.** 현재 난수 record allocator→HMAC publisher/profile 전환·전체 snapshot 이행이 끝나기 전 켜면 안 됩니다.

검수: 전체 단위1,457 통과, 관련33 통과, TypeScript·변경 ESLint 오류/경고0·로컬 webpack build 통과. PGlite에 실제 후보 SQL 적용·RPC를 실행하고 Next route/mock after와 합성 mock HTTP를 검수했습니다. 등록 응답 유실/pending epoch 재사용, cron 복구, 철회 후 stale lease, B보존, 광고 revision에서 ID 유지, 내부 회원 제외, 완료 증거 없는 성공 거절, 수집OFF·번호 설정 오류 중 철회 독립 전송을 확인했습니다. 실제 두 PostgreSQL 연결·정식 DEV HTTP·TIPS 원자적 차단·미국 Modal/모델/백업은 미검수입니다. UI 화면 변경이 없어 브라우저 UI 검수는 미실행입니다.

전 단계 c5b98e1의 필수 CI는 성공·migrate-dev SKIPPED를 읽기 확인했습니다. 아래 새 연결부 후보의 CI는 별도로 확인하며 이전 성공을 승계하지 않습니다. 이 브랜치 자동배포false 유지. 공유DEV/운영 코드·원격 DB·실제 키/환경변수·고객/TIPS 전송·고객발송 변경0.

남은 독립/공동 작업: HMAC publisher/profile migration·전체 snapshot 이행, 관리자 화면 source 등록/철회 경보 표시, 정식 TIPS receiver URL/runtime/전용키 및 D1/D2/D4 합의, 별도 승인 후 실제 DEV 다중PG/HTTP·원격 경쟁/재시도/receipt/연속ACK·격리복원 공동 검수입니다. 이번 묶음은 원천 저장 후 runtime 연결 후보까지이며 전체 고객별 연동 완료가 아닙니다.

MYIN은 기존 ID 산식을 유지하면서 즉시 철회 push/재시도, 과거5/30/5 혼합 authority·pull 호환, 키 교체·복구/원격 eligibility 경쟁 검수를 준비해야 합니다. 10/12 담당 회신은 그날 기준 보고이며 오늘 직접 MYIN runtime 확인이 아닙니다. MYIN 코드·34파일을 여기서 변경하지 않습니다.

중간 자료를 보내지 않고 이 묶음의 구현·검수 결과를 한 최종 통합 자료로 정리합니다. 실제 공동 검수/공유DEV/SQL·설정 활성화·운영은 기존 별도 승인 후입니다.

---

## 이전 후보 이력 (아래 수치·미연결 설명은 당시 상태)

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


## TIPS D1~D5 회신 후속 (2026-10-14)

- 대표가 전달한 담당자 보고: HMAC profile/기술epoch 원칙은 협의 후보, 실제 TIPS DEV origin/runtimeSHA/kid/Secret경로·HTTP receiver route 미등록. Python raw-body/사업digest/strictUTF8·UTC3/6자리 검증 후보와 EDU RC2 원코드 대소문자 보존 매핑/변환 로컬 후보는 진척됐으나 영구 facts·모델입력·현재자격·원격 atomic nonce/request/native fence·후속 receipt/연속ACK·미국/모델/백업·MYIN과거5/30/5 혼합pull 호환 미완료. 직접 TIPS 원천 조회/코드 검수 결과로 확대하지 않습니다.
- 전달된 ZIP8261a...와그 안의 source883a1f4는 그대로 보존. source883a1f4의 GitHub필수CI는05:19:09UTC 성공, migrate-dev는skipped 확인. CI성공은 배포/DB적용/계약합의가 아닙니다.
- ACK MIME검사 보완: application/json 또는 명시UTF-8만 허용, UTF16/다른charset/중복type/중복charset/알수없는parameter는 거절합니다. request signature bytes/초안version/정식rc.2는 변경하지 않습니다. 전달파일은 재생성하지 않으며 다음 의미있는 통합묶음에만 반영합니다.
- 관련24개시험·타입·변경ESLint통과. 실제 remote HTTP/계약합의·sharedDEV/DB/키/운영·고객전송 변경0.
- 다음: EDU source HMAC publisher/profile 이행·동의후dispatch/cron/알림UI의 후보 준비와원정밀시각/epoch/authority합의. TIPS는규격별fenced read/normalizer→영구facts·전체snapshot대조·nonce/request/native block 원자DB→정식receiver/전용키·고정SHA·합성공동검수준비. 실제URL/runtime 없는동안 주소를 추측해 호출하거나운영전송을켜지 않습니다.
