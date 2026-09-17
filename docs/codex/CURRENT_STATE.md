# Current State Snapshot

> 기준 시각: 2026-09-17 UTC  
> 이 문서는 인수인계 스냅샷이다. 작업 시작 전 GitHub, Vercel, Supabase의 실제 상태를 다시 확인한다.

## 1. Git 기준점

| 구분 | 상태 |
| --- | --- |
| Repository | `brandyaction-ricky/brandyaction-edu` |
| `origin/main` | `2a07717` — Meta 서버 설정 Production 재배포용 Commit |
| `origin/develop` | `b3e4ec5` — PR #90 병합 상태 |
| DEV 기준 최신 기능 | 대시보드 귀속·Meta sync·Meta-only 필터 후속 수정 포함 |

## 2. 대시보드·Meta 상태

`develop`에는 다음 수정 흐름이 포함돼 있다.

- PR #86: 대시보드 귀속 및 Meta sync 502 오류 분류·처리
- PR #87: Meta sync dimension 중복 제거
- PR #88: 대시보드 Meta dimension join 중복 제거
- PR #89: Meta-only dimension 필터 옵션 포함
- PR #90: Meta-only 필터 browser regression 보강

관련 최신 Migration:

- `20260916233858_repair_dashboard_attribution_and_meta_sync.sql`
- `20260917001342_dedupe_meta_sync_dimensions.sql`
- `20260917002218_dedupe_dashboard_meta_dimension_join.sql`
- `20260917012048_include_meta_dimensions_in_dashboard_filter_options.sql`

코드 병합 사실만으로 최종 QA_PASS 또는 Production 반영으로 판단하지 않는다. DEV Deployment, 실제 Meta 재동기화, 화면·DB·CSV 정합성을 다시 확인해야 한다.

## 3. 결제·쿠폰 P0 상태

- PR: `#84 fix: repair payment and coupon consistency`
- Branch: `fix/ba-payment-coupon-p0-001`
- Head: `87ba3b0a45fbccb2f6f72c2940431d5c2baa54e8`
- Base: `develop`
- GitHub 조회 상태: OPEN, mergeable
- 자체 검증 기록: 180 tests, lint, typecheck, build, DEV repair Migration, rollback smoke
- Production DB/Deployment 변경: 없음

중요: PR #84 Head는 현재 `origin/develop`의 ancestor가 아니다. 따라서 결제·쿠폰 P0 수정은 최신 통합 개발본에 포함되지 않았다.

다음 작업:

1. PR #84를 최신 `develop`과 동기화하고 충돌·회귀 확인
2. 결제·쿠폰 수정본을 `develop`에 병합
3. DEV Migration 및 Deployment 확인
4. 테스트 Toss 결제와 쿠폰 E2E 독립 QA
5. 대시보드·Meta 변경과 함께 최종 통합 RC QA

## 4. 운영 배포까지 남은 Gate

1. 결제·쿠폰 PR #84 통합
2. 최신 `develop` DEV Deployment Commit/Tree 확정
3. DEV Migration 이력과 checksum 확인
4. 결제·쿠폰·Meta·대시보드·권한 통합 QA_PASS
5. Production 환경변수 준비 상태 확인
6. 운영 DB Migration 적용과 검증
7. `develop → main` Release PR
8. Production Deployment
9. 운영 smoke test
10. `RELEASE_PASS` 기록

## 5. 반드시 재확인할 외부 상태

다음은 저장소만으로 확정할 수 없다.

- 현재 DEV Deployment ID와 별칭
- DEV DB의 2026-09-17 Migration 실제 적용 여부
- Meta access token 유효성 및 실제 sync 성공
- Production DB의 결제·쿠폰 repair 대상 객체
- 최신 QA 판정
- Vercel Runtime Error

조회 증거가 없으면 `미확인` 또는 `BLOCKED`로 기록한다.

## 6. 갱신 규칙

상태가 바뀌면 다음만 증거 기반으로 갱신한다.

- Commit, Tree, PR, Deployment ID
- Migration과 checksum
- QA 판정
- Production 적용 여부
- 남은 Blocker

과거 내용을 덮어써서 이력을 잃지 않도록 중요한 Release 결과는 별도 결과 문서 또는 GitHub PR에 남긴다.
