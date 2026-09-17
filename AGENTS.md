<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# BrandyAction EDU agent instructions

이 파일은 저장소 전체에 적용되는 Codex 작업 규칙이다. 하위 디렉터리에 더 구체적인 `AGENTS.md`가 생기면 해당 범위에서는 하위 파일을 우선한다.

## 1. 작업 시작 전 읽기 순서

1. `docs/codex/PROJECT_CONTEXT.md`
2. `docs/codex/CURRENT_STATE.md`
3. 변경 범위에 맞는 문서
   - 코드 구조: `docs/codex/ARCHITECTURE.md`
   - 환경·배포: `docs/codex/ENVIRONMENTS.md`
   - DB: `docs/codex/DATABASE.md`
   - 개발·QA·Release: `docs/codex/WORKFLOW.md`
4. 관련 기존 구현과 테스트
5. Next.js API 또는 관례를 변경한다면 `node_modules/next/dist/docs/`의 현재 버전 문서

대화 기록이나 오래된 결과 보고서보다 현재 코드, Git 상태, 실제 배포 및 DB 조회 결과를 우선한다. `CURRENT_STATE.md`는 인수인계용 스냅샷이므로 작업 시작 시 원격 상태와 대조한다.

## 2. 프로젝트 기준

- Framework: Next.js 16 App Router, React 19, TypeScript
- Runtime: Node.js 22 이상
- Database/Auth/Storage: Supabase
- Payment: Toss Payments
- Deployment: Vercel
- Production branch: `main`
- DEV integration branch: `develop`
- Production: `https://brandyaction-edu.com`
- DEV: `https://brandyaction-edu-dev.vercel.app`

## 3. 절대 보호 규칙

- `main` 또는 `develop`에 직접 커밋하지 않는다. 최신 `origin/develop`에서 `feature/*`, `fix/*`, `docs/*` 브랜치를 만든다.
- 사용자 승인과 Release Gate 없이 Production 배포, 운영 DB 변경, 라이브 결제·환불을 실행하지 않는다.
- 운영 DB에서 데이터 삭제, 초기화, 임시 테스트 데이터 삽입을 하지 않는다.
- 적용된 Migration 파일을 수정하지 않는다. DB 변경은 새로운 forward-only Migration으로 작성한다.
- `.env*`, Supabase service-role key, Toss secret, Meta token, webhook token을 커밋하거나 로그에 출력하지 않는다.
- 결제 금액, 할인액, 주문 소유자, 수강권, 권한은 클라이언트 값을 신뢰하지 않고 서버와 DB에서 검증한다.
- 권한 문제를 UI 숨김만으로 해결하지 않는다. API authorization과 RLS/RPC 권한을 함께 검증한다.
- 무료클래스 Landing, CTA 수집, 가격 Snapshot, Meta 성과, 실측 데이터의 기존 데이터를 보존한다.
- 실패한 외부 동기화가 기존 성공 데이터를 지우거나 마지막 성공 시각을 갱신하지 않게 한다.

## 4. 구현 원칙

- 기존 모듈과 RPC를 먼저 찾아 재사용한다. 같은 기능을 다른 경로에 중복 구현하지 않는다.
- `app/[[...path]]/page.tsx`는 라우트 유효성 및 최상위 진입점이다. 신규 화면은 기존 `Platform` 구조와 권한 정책을 확인한다.
- 관리자 기능은 `lib/operator-permissions.ts`, `lib/operator-scopes.ts`, `app/api/platform/route.ts`의 정책을 함께 확인한다.
- 결제 변경은 `app/api/platform/payment/route.ts`, 결제/쿠폰 Migration, `tests/platform-payment.test.mjs`를 함께 검토한다.
- 마케팅 대시보드 변경은 API, SQL RPC, CSV export, 화면, browser test를 한 세트로 검증한다.
- UI 변경은 기존 `app/ui/final/`과 디자인 토큰을 우선 사용하고, 관련 없는 화면을 재설계하지 않는다.
- 소스 수정은 가능한 최소 범위로 유지하고 관련 없는 사용자 변경을 되돌리지 않는다.

## 5. 필수 검증

일반 코드 변경의 기본 검증:

```bash
npm ci
npm run lint
npx tsc --noEmit
npm test
npm run build
```

브라우저 동작에 영향을 주는 경우:

```bash
npm run test:browser
```

DB 변경이 있는 경우:

- Migration SQL 정적 검토
- DEV DB 적용 전후 객체 확인
- checksum과 적용 이력 확인
- 가능한 경우 트랜잭션 rollback smoke test
- RLS, Grant, Trigger, 함수 본문 검증
- 테스트 데이터 잔존 여부 확인

실행하지 못한 검증은 PASS로 쓰지 말고 원인과 미검증 범위를 명시한다.

## 6. 상태 판정

- 개발자 자체 테스트 완료는 `READY_FOR_QA` 또는 `FIXED_PENDING_QA`다.
- 독립 검증 전에는 `QA_PASS`로 판정하지 않는다.
- `QA_PASS` 받은 Commit과 Release Commit/Tree가 다르면 재QA한다.
- Production 배포 후 실제 URL과 Commit/Tree/Deployment, Runtime Error, 핵심 사용자 흐름을 확인해야 `RELEASE_PASS`다.

## 7. 완료 보고

최종 보고에 다음을 포함한다.

- Branch, Commit, Git Tree, PR
- 변경 파일과 변경 이유
- Migration과 checksum, 적용 환경
- 실행한 검증과 결과
- 실행하지 못한 검증
- 데이터 및 권한 영향
- Production 변경 여부
- 남은 Blocker와 다음 전달 채널
