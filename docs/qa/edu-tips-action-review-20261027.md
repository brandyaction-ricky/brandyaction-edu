# EDU TIPS 안내 후보의 원천 최종 검수

2026-10-27. 기능 의도·진행 기록 정본은 OS 문서 `2444d528-192c-4837-8c0b-8a61e490319b`입니다. 이 파일은 코드 후보의 재현 방법과 실행 경계를 기록합니다.

## 실행 위치

- 저장소: brandyaction-ricky/brandyaction-edu
- 로컬 격리 작업본: `/private/tmp/edu-tips-final-review-20261027`
- 브랜치: `codex/edu-tips-final-review-20261027`
- 기준 develop: `83d6a7ff72170e9b1a73a656a60adf8399bf1641`
- 변경: 관리자 학습 관리 POST의 검수 전용 분기, 실제 Supabase 조회 adapter, 관련 시험. 새 SQL·DB 객체 없음.
- 최초 로컬 후보 이후 PR #476을 열었습니다. 공유 DEV·운영 배포는 아래 추가 검수 시점까지 미실행이며, 새 전달 ZIP 생성·리키님 발송은 없습니다.

## 내부 검수 호출

`POST /api/admin/learning-care`, 기존 관리자 로그인·회원 관리 권한·동일 origin 필요. 서버 환경의 `EDU_TIPS_ACTION_REVIEW_ENABLED=true`일 때만 사용하며 기본은 OFF입니다. 이번에는 외부 환경에서 켜지 않았습니다. 일반 메시지 기능의 ON/OFF와 분리됩니다.

```json
{
  "tipsReview": {
    "intent": "learning_support",
    "memberId": "00000000-0000-4000-8000-000000000001",
    "courseId": "00000000-0000-4000-8000-000000000002",
    "cohortId": "00000000-0000-4000-8000-000000000003",
    "enrollmentId": "00000000-0000-4000-8000-000000000004",
    "lessonId": "00000000-0000-4000-8000-000000000005",
    "channel": "email"
  }
}
```

위 번호는 형식 설명용 가상 번호입니다. `course_offer`는 enrollmentId/lessonId를 받지 않습니다. 채널은 email/kakao이며, 이는 실제 제공자·승인 템플릿·발송 경로가 준비됐다는 뜻이 아닙니다. 입력에 actorId·판정·deliveryAllowed 등을 추가하거나 수동 발송 본문과 섞으면 거절합니다.

응답은 `mode=review_only`, `deliveryAllowed=false`이며, `review.decision`은 excluded/review_only, `reason`은 판정 근거 코드입니다. 현재 원천 조회 실패·누락 의심 시 503과 ‘판정 보류’를 반환합니다. 제외 여부를 확인하지 못한 요청을 통과시키지 않습니다. 캐시 금지입니다.

이 호출은 EDU 내부 회원번호를 이미 확인한 관리자의 검수 계약입니다. 외부 TIPS API·HMAC 번호 수신/해석·consent_epoch 등록 계약으로 사용하지 않습니다. 검수 결과를 나중의 발송 허가로 재사용할 수 없습니다.

## 원천 판정과 확인 결과

| 입력/현재 상태 | 결과 |
|---|---|
| 진행 중 기수, 유효 수강권·결제·현재 동의, 실제 학습 지연 | 검수 후보, 발송 불가 |
| 전액 취소 또는 환불 원장에는 전액 환불이나 수강권이 여전히 active | 학습 안내 제외 |
| 부분 환불 후 잔액·유효 수강권 유지 | 검수 후보, partialRefund=true |
| 기수 종료 | 학습 이탈/복귀 안내 제외 |
| 수강권 회수·기간 만료 | 학습 안내 제외 |
| 관리자 발급 수강권 | 가짜 구매 기록 없이 현재 학습 조건으로 검수 |
| 최근 방문하여 학습 지연 조건 해소 | 학습 지원 후보 제외 |
| 분석/해외 동의 또는 해당 채널 마케팅 동의 철회 | AI 선정 CRM 후보 제외 |
| 같은 기수 수강권 보유 | 해당 기수 구매 안내 제외 |
| 같은 기수의 과거 유료 구매·환불 이력 | 자동 구매 안내에서 제외하고 별도 검토 필요 |
| 이전 기수만 구매 | 새 기수 보유로 오인하지 않음 |
| 주문·결제·환불 조회 실패/반환 누락/상한 초과 | 판정 보류, 발송 불가 |
| 다른 회원·권한 없는 요청 | 다른 회원 불변, 권한 없는 조회 차단 |

원천의 구매 내역은 새 분석 동의 시각으로 잘라 읽지 않습니다. 학습 관리의 실제 기존 RPC/판정과 상거래 원장을 함께 확인합니다. 일반 수동 서비스 안내의 동의 규칙과 sender는 변경하지 않았습니다. 주문 100건·결제 100건·환불 1,000건 등의 상한이나 count 불일치는 별도 검토 사유이며, 일부만 읽고 전체 확인으로 표시하지 않습니다. 주문에 결제 시도가 여러 개 있어도 임의 한 건을 고르지 않고 보류합니다.

## 재현·QA

```sh
node --test tests/tips-action-review.test.mjs tests/learning-care.test.mjs
node --test tests/tips-action-review.test.mjs tests/learning-care.test.mjs tests/learning-care-database.test.mjs tests/learning-care-channels-database.test.mjs tests/learning-care-client.test.mjs tests/learning-care-channels.test.mjs
./node_modules/.bin/tsc --noEmit --incremental false
./node_modules/.bin/eslint app/api/admin/learning-care/route.ts lib/edu-tips-action-review-server.ts tests/tips-action-review.test.mjs tests/helpers/tips-action-review.mjs
./node_modules/.bin/next build --webpack
git diff --check
```

관련 시험 12/12 및 기존 학습 관리·채널 DB/클라이언트까지 확대한 회귀 시험 49/49, TypeScript·변경 파일 ESLint·Next webpack 빌드 통과. 추가한 최근 방문 시험의 fixture 컬럼 오기를 수정하고 관련 시험을 다시 통과했습니다. 메시지 기능 ON/OFF 양쪽에서 검수 요청은 일반 발송 경로에 진입하지 않습니다.

위 로컬 시험은 실제 supabase-js가 요청 쿼리를 생성하며, 합성 전용 in-process fetch가 격리 PGlite의 실제 원천 테이블 DDL과 기존 함수에 연결합니다. 가짜 판정 응답만 주입한 시험은 아니지만, 이 시험 자체는 PostgREST HTTP 왕복이 아닙니다. 현지 UI는 추가하지 않았습니다.

### DEV 배포 전 실제 원천 사전 검수

대표의 DEV 반영·합성 검수 승인 후 DEV Supabase `vjmjhaidlqkmascdjocw`에 시험 관리자와 가상 A/B·시험 주문을 만들고 실제 기존 RPC·Auth·PostgREST를 조회했습니다. 로컬에서 실행한 현재 앱의 HTTP 판정 18사례(권한·재시도·전체 취소/환불·부분환불·기수 종료·수강권 회수·채널/분석 철회·다른 회원 보존·동의 전 구매·새 기수 구분·발송/큐 0)가 통과했습니다. DEV 예약 CRM은 기존 OFF를 확인했고 로컬 발송 기능도 OFF였습니다. 모든 합성 계정·주문·수강/강의 자료를 정리하고 Auth·profiles 잔존 0을 확인했습니다. 실제 고객·TIPS 전송·실발송·광고 실행·운영 변경은 없습니다. 이 사전 결과는 고정 DEV 주소 배포 완료의 증거가 아니며, 배포 후 그 주소에서 다시 대조합니다.

잘못된 intent/channel 배열을 문자열로 강제 변환해 받던 입력 검사를 보완했습니다. 해당 요청은 400으로 거절하며 원천 조회나 sender에 들어가지 않습니다. 최종 후보의 원격 CI와 고정 DEV 배포 결과는 OS 기존 로그에 이어 기록합니다.

## 다음 연결

1. 이 고정 코드 후보를 공유 DEV에 반영할 때 기존 검수와 조율하고, 실제 PostgREST에서 동일 합성 사례를 확인합니다. 기본 OFF와 외부 발송 차단을 유지합니다.
2. TIPS DEV 실행 주소·고정 배포본·전용 시험 키·격리 합성 저장 범위가 확인되면, 모델 후보 → EDU 내부 식별/현재 eligibility → 이 원천 판정의 왕복을 연결합니다.
3. 실제 발송 전에는 원자적인 예약 등록·중복 방지 및 공급자 호출 직전 결제/환불/수강·철회 재확인을 별도 구현·검수해야 합니다. 현재 여러 조회는 하나의 원자적 발송 트랜잭션이 아닙니다. 승인 템플릿·채널·실행 정책도 별도입니다.

이번 범위는 기존 앱 서버에 원천 판정을 붙인 로컬 후보이며, TIPS와의 실제 DEV 전체 연동 또는 고객별 CRM 운영 완료가 아닙니다.
