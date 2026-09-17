# BrandyAction EDU Codex 인수인계 문서

이 디렉터리는 새 Codex 세션이 과거 채팅에 의존하지 않고 저장소를 안전하게 이해하고 작업하도록 만든 정본 진입점이다.

## 읽기 순서

| 순서 | 문서 | 목적 |
| --- | --- | --- |
| 1 | `../../AGENTS.md` | 저장소 전체 작업 규칙 |
| 2 | `PROJECT_CONTEXT.md` | 서비스 목적과 제품 범위 |
| 3 | `CURRENT_STATE.md` | 최신 브랜치·PR·배포 준비 상태 |
| 4 | `ARCHITECTURE.md` | 코드, API, 데이터 흐름 |
| 5 | `ENVIRONMENTS.md` | 로컬·DEV·Production 환경 설정 |
| 6 | `DATABASE.md` | Supabase와 Migration 안전 규칙 |
| 7 | `WORKFLOW.md` | 개발, QA, Release 절차 |

## 문서 우선순위

충돌 시 다음 순서로 판단한다.

1. 실제 코드와 테스트
2. 실제 Git 원격 상태
3. 실제 Vercel·Supabase 상태
4. 루트 `AGENTS.md`
5. 이 디렉터리의 문서
6. 과거 작업 보고서와 대화 기록

환경변수 값, 계정 비밀번호, 서비스 역할 키, 결제 비밀키, Meta 토큰은 이 문서에 기록하지 않는다.
