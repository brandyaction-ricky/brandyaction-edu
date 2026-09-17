# Environments and Codex Setup

## 1. 환경 구분

| 구분 | Branch | Vercel | URL | Supabase project ref | 결제 |
| --- | --- | --- | --- | --- | --- |
| Production | `main` | `brandyaction-edu` | `https://brandyaction-edu.com` | `qitqxizuwmmlhlcgsrqe` | Toss live keys |
| DEV | `develop` | `brandyaction-edu-dev` | `https://brandyaction-edu-dev.vercel.app` | `vjmjhaidlqkmascdjocw` | Toss test keys |
| Feature/BUGFIX | `feature/*`, `fix/*`, `docs/*` | Preview 또는 로컬 | 배포별 URL | 기본적으로 DEV만 사용 | 실제 과금 금지 |

프로젝트 ref와 공개 URL은 식별자이며 secret이 아니다. API key, service-role key, access token은 문서에 기록하지 않는다.

## 2. Codex 환경 생성

1. GitHub 저장소 `brandyaction-ricky/brandyaction-edu`를 연결한다.
2. 작업 기준 브랜치를 `develop`으로 선택한다.
3. Setup command는 다음을 사용한다.

```bash
npm ci
```

4. 일반 개발 환경변수는 DEV 값으로만 등록한다.
5. 네트워크 접근이 필요한 검증은 GitHub, Vercel, Supabase, Toss test API, Meta Graph API에 한정한다.
6. 첫 작업 전에 `AGENTS.md`와 `docs/codex/` 문서를 읽는다.

공식 Codex는 저장소별 지속 지침을 `AGENTS.md`에 두고, cloud environment에서 setup script와 환경변수를 구성하는 방식을 지원한다.

- AGENTS.md: `https://learn.chatgpt.com/docs/agent-configuration/agents-md`
- Cloud environment: `https://learn.chatgpt.com/docs/environments/cloud-environment`
- GitHub integration: `https://learn.chatgpt.com/docs/third-party/github`

## 3. 로컬 실행

```bash
npm ci
cp .env.example .env.local
npm run dev
```

`.env.local`에는 DEV 값만 입력한다. 실제 값이 들어간 파일은 커밋하지 않는다.

## 4. Runtime 환경변수

| 이름 | 공개 여부 | 용도 | 환경 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_ENV` | 공개 | development/production 구분 | DEV/Production |
| `NEXT_PUBLIC_SUPABASE_URL` | 공개 | Supabase URL | 분리 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 공개 | browser Supabase key | 분리 |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | 서버 관리자 DB 작업 | 분리 |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | 공개 | Toss SDK | test/live 분리 |
| `TOSS_SECRET_KEY` | Secret | Toss 승인·조회·환불 | test/live 분리 |
| `TOSS_WEBHOOK_TOKEN` | Secret | 웹훅 요청 검증 | 분리 |
| `EDU_ALLOW_LIVE_REFUNDS` | 서버 설정 | 라이브 환불 실행 Gate | 기본 `false` |
| `META_GRAPH_API_VERSION` | 서버 설정 | Meta Graph API 버전 | Preview/Production |
| `META_ACCESS_TOKEN` | Secret | Meta 실적 동기화 | Preview/Production 분리 |
| `SOLAPI_*` | Secret | CRM 메시지 발송 | 환경별 |
| `CRM_DELIVERY_ENABLED` | 서버 설정 | 실제 CRM 발송 Gate | 기본 `false` |
| `CRON_SECRET` | Secret | Vercel Cron 검증 | 환경별 |

`PG_SECRET_KEY`는 코드의 구버전 호환 fallback이다. 새 환경은 `TOSS_SECRET_KEY`를 정본으로 설정한다.

## 5. Migration 전용 환경변수

`SUPABASE_ACCESS_TOKEN`은 `scripts/apply-dev-migrations.mjs`가 사용하는 로컬/CI 전용 값이다.

- Vercel Runtime에 등록하지 않는다.
- GitHub Actions에서는 repository secret `DEV_SUPABASE_ACCESS_TOKEN`을 job 환경변수 `SUPABASE_ACCESS_TOKEN`으로 매핑한다.
- 현재 스크립트는 DEV project ref를 고정 검증 대상으로 사용한다.
- Production Migration에는 이 스크립트를 사용하지 않는다.

## 6. 배포 후 환경 확인

- DEV는 `NEXT_PUBLIC_APP_ENV=development`
- Production은 `NEXT_PUBLIC_APP_ENV=production`
- Vercel 환경변수 변경 후 반드시 새 Deployment를 생성한다.
- 배포된 Commit과 Git Tree를 기록한다.
- 비밀값은 화면, 로그, 결과 보고서에 출력하지 않는다.
