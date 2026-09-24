# Development, QA and Release Workflow

## 1. 브랜치 흐름

```text
origin/develop
→ feature/* 또는 fix/* 또는 docs/*
→ 자체 검증
→ PR to develop
→ DEV Deployment + DEV Migration
→ 독립 QA
→ QA_PASS Commit/Tree 고정
→ develop → main PR
→ Production Migration
→ Production Deployment
→ Smoke Test
→ RELEASE_PASS
```

`main` 대상 PR의 source branch는 CI 정책상 `develop`이어야 한다.

## 2. 작업 시작

```bash
git fetch --all --prune
git status --short --branch
git log --all --oneline --decorate -20
git switch -c <type>/<task-id> origin/develop
```

추가로 확인한다.

- 관련 열린 PR과 중복 작업
- 최신 DEV Deployment Commit
- 관련 Migration의 DEV 적용 여부
- QA 실패 항목
- Production과 DEV의 차이
- 작업 트리의 사용자 변경

## 3. 개발 완료 Gate

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

화면 동작 변경 시:

```bash
npm run test:browser
```

결과는 명령별 exit code와 통과 개수로 기록한다. Browser runtime이 없어 실행하지 못했다면 CI 또는 DEV 검증이 필요하다고 명시한다.

## 4. QA Gate

`개발 완료 != QA_PASS`다. QA는 고정된 Commit, Tree, Deployment를 대상으로 독립 수행한다.

필수 범주:

- 비회원·일반 회원·staff·admin 권한
- 공개 클래스와 회원 핵심 흐름
- 주문·쿠폰·결제·수강권
- 관리자 저장·재접속
- 무료클래스 CTA와 이벤트
- 마케팅 필터·집계·CSV
- Meta 실연동과 실패 시 데이터 보존
- 모바일 핵심 CTA
- Runtime Error

P0/P1 실패는 정확한 BUG ID와 재현 절차로 `fix/*`에 전달한다. 수정 Commit이 바뀌면 실패 항목과 영향 회귀를 다시 검증한다.

## 5. Release Gate

Production 변경 전 확인:

- 최종 QA 결과가 `QA_PASS`
- QA Commit/Tree와 Release 후보 일치
- 열린 Release Blocker 없음
- CI PASS
- DEV Deployment READY
- Production 환경변수 준비
- Production DB 상태 확인
- Migration checksum 일치
- Rollback 기준 Commit/Deployment 확보

적용 순서:

1. Production DB Migration
2. 검증 쿼리
3. `develop → main` PR 병합
4. Vercel Production Deployment
5. 도메인 별칭과 Commit/Tree 확인
6. Production smoke test

## 6. Production smoke test

- 홈페이지와 공개 클래스 목록·상세
- CTA 링크와 이벤트 수집
- 일반 회원 로그인
- 관리자 로그인과 메뉴 이동
- 유료상품 주문 진입
- 쿠폰 검증
- 제한된 결제 검증은 사전 승인된 QA 상품·계정·금액으로만 수행
- 마케팅 대시보드와 CSV
- Meta 설정·동기화
- 상세 HTML과 무료자료
- 최근 Runtime Error

실제 결제, 환불, 회원 삭제처럼 복구 비용이 있는 행위는 사용자 승인과 별도 실행 계획 없이 수행하지 않는다.

## 7. 판정 용어

| 판정 | 의미 |
| --- | --- |
| `READY_FOR_QA` | 개발 자체 검증 완료, 독립 QA 전 |
| `FIXED_PENDING_QA` | BUG 수정 자체 검증 완료 |
| `QA_PASS` | 고정 RC의 독립 검증 통과 |
| `QA_FAIL` | 배포 차단 오류 존재 |
| `QA_BLOCKED` | 환경·권한·데이터 때문에 검증 불가 |
| `RELEASE_READY` | QA와 배포 전 Gate 통과 |
| `RELEASE_PASS` | 운영 배포 및 smoke test 완료 |
| `RELEASE_FAIL` | 운영 반영 또는 smoke test 실패 |

## 8. 문서 갱신

중요 PR 병합, QA 판정, Production 배포가 끝나면 `CURRENT_STATE.md`를 갱신한다. 단순 계획이나 자체 검증을 실제 배포 완료로 기록하지 않는다.
