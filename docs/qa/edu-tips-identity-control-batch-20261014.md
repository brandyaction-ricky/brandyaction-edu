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
