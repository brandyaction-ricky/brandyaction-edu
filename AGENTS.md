<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## BRANDYACTION OS 정본 연결

- 모든 새 세션과 새 개발 주제는 먼저 [BRANDYACTION AI 에이전트 운영 정본 — OS ONLY](https://brandyaction-os.vercel.app/knowledge)를 원문으로 열고 현재 버전의 진입 절차·역할 레지스트리·개발 협업 절을 적용한다.
- 회사 업무의 기능 의도, 사용자 흐름, UI/UX 판단, 결정과 QA 대화는 OS 문서 작업공간이 정본이다. 요청 상태, 담당자, Work 인계, PR·Preview·배포 이력은 [OS 개발 관리](https://brandyaction-os.vercel.app/knowledge/development), 실행 코드·브랜치·커밋·PR·되돌리기는 GitHub가 소유한다.
- 개발 요청은 OS `04_개발/개발 작업공간 — 인덱스`와 대상 프로젝트의 기존 `개발 현황·요청 로그`에서 시작한다. 새 폴더나 문서를 임의로 만들지 말고 OS에서 실제 경로·기존 문서·요청 ID를 먼저 확인한다.
- 기본 작업 단위는 로컬 격리 브랜치 개발·1차 QA → commit·push·PR → Vercel Preview 링크 확인 → 협업자 QA 인계다. Preview URL에는 검수 대상 커밋과 배포 ID를 함께 기록한다.
- 로컬 파일에는 OS 운영 정본의 세부 규칙을 복제하지 않는다. 이 저장소에는 프로젝트 고유 실행·보안 경계만 유지하고, 공통 절차가 바뀌면 OS 원문을 따른다.

## Codex 실행 원칙 (로컬 개발환경 설정, 2026-09-17)

- 작업 시작 시 현재 branch, status, remote, worktree 목록과 기존 AGENTS.md 및 관련 하위 지침을 읽는다. 기존 파일·사용자 변경·브랜치를 삭제하거나 덮어쓰지 않는다. reset --hard, clean, 강제 push를 임의로 실행하지 않는다.
- main/master 및 공유 develop에서 직접 수정·커밋·push하지 않는다. 작업마다 codex/<task> 또는 기존 work/<task> 관례의 별도 브랜치와 격리 worktree를 사용한다. 작업 중인 다른 worktree의 브랜치를 전환하지 않는다.
- DEV: 범위와 완료 조건을 정하고 로컬/검증된 개발 환경에서 구현한다.
- QA: 실제 변경 커밋 기준으로 관련 테스트와 diff를 확인하고 수행/미수행 항목을 구분한다. 테스트 성공은 운영 승인이나 배포 성공을 의미하지 않는다.
- BUGFIX: QA 실패를 작업 브랜치에서 수정한 뒤 QA를 다시 통과한다. 결함이 없으면 해당 없음으로 기록한다.
- RELEASE: DEV → QA → BUGFIX(필요 시) → QA 재검증 후 릴리스 후보를 보고한다. main 병합, 원격 push로 유발되는 배포, 운영 배포는 대상·커밋·영향을 명시한 별도 사용자 승인 전 실행하지 않는다. 자동 배포 연결 여부도 먼저 확인한다.
- Production/운영 DB의 데이터·스키마·정책·설정은 임의 변경 금지. migration/seed/reset 명령을 자동 실행하지 않는다. `brandyaction-edu-dev` 프로젝트 배포는 사용자의 건별 명시 승인 후 허용한다. 실제 운영 프로젝트 `brandyaction-edu`의 배포·승격은 대상 프로젝트, 고정 commit SHA, 포함 변경, migration 여부, 롤백 대상을 명시하고 사용자가 건별로 최종 승인한 경우에만 허용한다. 운영 DB·환경변수·웹훅 변경과 실결제·실환불은 이 승인에 포함되지 않으며 각각 별도 명시 승인이 필요하다.
- 라이브 결제·환불·운영 webhook 호출 및 운영 환경변수 변경은 별도 명시 승인 전 금지한다. 운영 배포·승격은 위 RELEASE 게이트와 고정 SHA 기준의 최종 승인을 모두 통과한 경우에만 실행한다. 테스트는 실제 연결 대상이 확인된 개발 DB/샌드박스 결제를 우선 사용하며, 불명확하면 외부 쓰기를 중단하고 로컬 검증을 수행한다.
- 비밀값을 문서·Git·로그·채팅에 기록하지 않는다. 운영 환경변수를 자동 복사하거나 다운로드하지 않는다.
- 종료 보고: 실제 repo/worktree 경로, branch, 기준 및 결과 commit, 미커밋 변경, PR(없으면 없음), 테스트 결과/미수행 사유, deployment(미실행/검증 여부), 남은 게이트와 사용자 필요 조치를 명확히 구분한다. 보고는 한국어로 한다.
- 이 지침은 실행 규칙이며 서버 측 브랜치 보호나 기술적 배포 차단을 설치한 것은 아니다.

### 프로젝트 식별

- 제품: BrandyAction EDU
- 기존 Next.js 지침 블록을 유지하고 개발 시 설치 버전의 문서를 확인한다.
