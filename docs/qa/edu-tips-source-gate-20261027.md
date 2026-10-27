# EDU 고객별 원천 확인 연결 후보 — 2026-10-27

정본: OS `2444d528-192c-4837-8c0b-8a61e490319b`. 이 파일은 코드 후보의 재현·적용 경계입니다.

## 문제와 변경

실제 TIPS DEV 시연에서 기수 종료 자료를 받아도 ‘수강 중 이탈’ 후보가 남았고, 전액 환불 이벤트를 넣은 뒤에는 새 계산이 실패했습니다. 별도로 모델 후보를 EDU 원장에 자동 확인하는 경로도 없었습니다. 앞선 #476은 내부 관리자 검수에만 쓸 수 있었습니다.

이번 후보는 가명 고객번호·동의 회차·공개 상품/기수 코드로 EDU 원장을 읽는 서버 간 연결을 추가합니다. 관리자 판정과 같은 공통 함수를 사용하며, 원천의 단일 MVCC 스냅샷에서 동의·구매·환불·수강·실제 학습을 확인합니다. 동의 이전 구매도 확인합니다. 내부 회원 UUID, 이메일, 이름, 주문/강의 UUID는 응답하지 않습니다. **판정은 검수용이며 발송 허가가 아닙니다.**

- 격리 브랜치: `codex/edu-tips-source-gate-20261027`
- 기준: develop `e74ace7d86a5994e4f0d57241f4260c54a1b4d13` (#476 포함)
- 새 SQL: `20261027062000_edu_tips_source_action_review.sql` 한 건. 키 테이블·공유 분당 120회 제한·읽기 컨텍스트 함수. 키/고객/소비자/플래그를 설치하거나 활성화하지 않습니다.
- 기본 OFF: `EDU_TIPS_SOURCE_REVIEW_API_ENABLED=false`. 기존 관리자 검수 플래그와 별도입니다.
- 자동 Preview는 이 브랜치에서 비활성화합니다. 공유 DEV DB/운영 연결을 복사하지 않습니다.

## 제안하는 서버 간 계약

이 계약은 새 후보이며 리키님과 확정한 rc.2 피드나 D4 철회 규격을 바꾸지 않습니다.

`POST /api/internal/tips/action-review/v1/check`

`X-Contract-Version: edu-action-review/1.0-draft.1`

- 별도 Bearer 키, DB에는 SHA256만 보관, scope=`edu.action.review`, 소비자/환경/만료/회수 확인.
- 기존 v1/피드/삭제/eligibility 키를 재사용하지 않습니다.
- JSON 최대 4KiB, 중복 키·잘못된 UTF-8·추가 필드·내부 UUID 입력 거절. 처리 제한 15초. 응답 no-store.
- `cohort_code`는 기존 피드와 같은 `course_code:cohort_code`이며 원래 대소문자를 유지합니다.
- lesson/enrollment는 외부에서 지정하지 않습니다. EDU가 현재 수강권과 실제 미완료 학습에서 선택합니다.

```json
{
  "customer_id": "k1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "consent_epoch": "ce_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "product_id": "EDU-MOONSHOT",
  "cohort_code": "EDU-MOONSHOT:C4",
  "intent": "learning_support",
  "channel": "email"
}
```

합성 형식 예시입니다. intent는 `learning_support`/`course_offer`, channel은 `email`/`kakao`. 실제 친구톡 상품·승인 템플릿이나 발송 채널 준비를 뜻하지 않습니다.

성공 응답은 식별 범위·intent/channel과 `review`(decision/reason/reviewedAt/선택 partialRefund), `mode=review_only`, `deliveryAllowed=false`만 제공합니다. source 시각은 SQL이 만든 UTC 소수 6자리를 응답까지 보존합니다. 401 잘못된/다른 환경/회수/만료 키, 429 공유 제한, 400/413/415 입력 오류, 503 OFF·조회 실패·불완전 원장입니다. 원문 DB 오류는 내보내지 않습니다.

검수 결과를 캐시하거나 나중의 발송 허가로 쓰면 안 됩니다. 실제 공급자 호출 직전 원자적 예약·중복 방지·다시 확인과 별도 실행 계약이 필요합니다.

## 기능 검수

실제 기존 수강·학습 함수와 상거래 DDL을 격리 PGlite에 적용합니다. 실제 supabase-js와 TypeScript HTTP handler를 연결하되 HTTP transport만 로컬 SQL로 매핑합니다. 판정 응답을 가짜로 주입하는 검사가 아닙니다. 실제 원격 PostgREST/TIPS 왕복은 별도 미완료입니다.

검수 사례: 동의 전 구매 포함, 전액 환불/취소와 수강권 갱신 지연, 유효 부분환불, 기수 상태/종료시각, 수강권 회수/만료, 최근 방문, 실제 학습 제출 완료, 채널·분석 철회, 다른 epoch/상품 대소문자, 동일 기수 구매/환불 재판매 제외. 다른 회원과 원 결제 보존, 발송 0. 별도 키·환경·회수·권한·제한·잘못된/누락 응답·중단 요청도 확인합니다.

```sh
node --test tests/tips-source-action-review.test.mjs tests/tips-action-review.test.mjs
npm test
npx tsc --noEmit
npx eslint lib/edu-tips-action-review*.ts app/api/internal/tips/action-review/v1/check/route.ts
npm run build
git diff --check
```

## 아직 연결되지 않은 부분

1. 이 후보의 공유 DEV SQL·전용 키·임시 활성화는 아직 실행하지 않았습니다. 승인 후 합성 계정으로 실제 DEV HTTP를 확인해야 합니다.
2. TIPS는 이 새 계약을 아직 호출하지 않습니다. TIPS 재계산·CRM mock 앞의 원천 확인 연결과 상태 변경 시나리오를 공동 검수해야 합니다.
3. TIPS의 alumni 제외/전액 환불 실패는 원격 소비자 배포 코드·로그 접근 없이 직접 수정할 수 없습니다. 재현 증적은 통합 회신 내부 초안에 보존합니다.
4. EDU 일별 학습 피드의 실제 원천 projector는 현재 availability/cohort_state를 unknown, 구매 당시 분모가 없는 이용률을 null로 냅니다. 수동 합성 피드 상태 변경 검수를 실제 원장 자동 생산 검수라고 표시하면 안 됩니다. 정상 수료·기수 종료·이용 가능성은 이번 원천 확인에서 직접 확인하되, 예측 입력에 기수 상태를 반영하는 producer 갱신은 별도 보완 사항입니다.
5. 실제 고객 전송·고객 발송·광고 집행·운영 DB/사이트 변경은 없습니다. 리키님께 파일/메시지를 보내지 않습니다.
