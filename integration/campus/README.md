# EDU 연결 작업 — 원래 문샷 인계 ZIP 기준

대표 결정 2026-11-02: 윤익님은 처음 전달한 `moonshot-campus-handoff-20261102.zip`으로 공간·오피스를 개발한다. 추가 인계 ZIP으로 기준을 바꾸지 않는다. 이 브랜치는 EDU 기능 연결만 개발하며 3D 화면 소스는 포함하거나 수정하지 않는다.

원본 ZIP SHA256: `12a533d4459e34bc55cb5abbc804ca49f7997793b28711c4cfffaec470044171`.
파일별 기준은 `original-prototype.sha256`에 보존했다. 합본 수령 시 원본 대비 변경을 확인하고 기존 작업을 덮어쓰지 않는다.

## 현재 구현

- `GET /api/campus`: 기존 활성 회원 인증과 사용자 세션/RLS로 본인의 이용 가능한 수강권을 조회한다. `enrollmentId`를 선택하면 그 과정의 공개 수업, 공개 과제, 본인 최신 제출 상태·수업 완료 여부만 전달한다.
- `features/campus`: 공개/권한 필터, 작은 응답 모델, 서버 읽기 처리. 과제 본문·피드백 원문·이메일·결제·토큰·AI 답변은 읽거나 전달하지 않는다.
- `public/campus/edu-bridge.mjs`: 프레임워크 독립 연결 코드. 기수 선택/갱신, 기존 수업·과제·내 질문 화면 이동. 이동 전 수강권과 공개 상태를 새로 확인한다. 수업 ID 기준으로 연결하고 버전을 전달한다.
- `EDU_CAMPUS_ENABLED=true`인 환경에서만 서버 경로가 열린다. 기본 OFF이며 실제 환경변수는 변경하지 않았다. 새 DB 구조·쓰기·회원 메뉴 추가·캠퍼스 공개 없음.
- 원래 프로토타입의 데모 과제/집중 타이머/XP/피드백은 서버 기능이 아니다. 이번 API는 그 데모를 진짜 기록이라고 저장하지 않는다. 동료 피드백과 로켓 발사 판정은 미구현이므로 `launchEligibility: null`을 반환한다.

## 합본 화면과 연결할 지점

동일 EDU 출처의 화면에서만 아래 모듈을 가져온다. 다른 출처 iframe 인증/postMessage는 아직 지원하지 않는다. 반환된 문구는 textContent나 React 텍스트로 렌더링하고 innerHTML에 넣지 않는다.

```js
import { createEduBridge } from '/campus/edu-bridge.mjs';
const edu = createEduBridge({
  onState(state) {
    // loading/error/closed: 이전 회원·수업 표시 제거
    // ready: state.snapshot.scopes를 기수 선택에, lessons를 미션 지도에 연결
  },
});
const context = await edu.load();
// 사용자가 선택한 enrollmentId로 await edu.load(enrollmentId)
// 수업: edu.openLesson(enrollmentId, lessonId)
// 과제 입력/피드백: edu.openMission(enrollmentId, lessonId, missionId)
// 내 질문: edu.openQuestions()
// 로그아웃/화면 이탈/컴포넌트 해제: edu.dispose()
```

이 모듈은 루프나 위치 동기화를 만들지 않는다. 캐릭터 이동·카메라·렌더러는 윤익님 코드에 남는다. 공개 자료는 전체 수강권 중 선택한 과정만 읽는다. 목록이 한도를 넘거나 DB 조회에 실패하면 부분 목록을 완성된 지도처럼 표시하지 않고 오류를 반환한다.

## 이어서 할 개발

1. 합본의 화면 프레임워크·진입/이탈 수명주기를 확인해 어댑터를 장착한다. 기존 공간을 자동 덮어쓰지 말고 기준 파일 해시로 변경을 비교한다.
2. 실제 DEV에서 로그인, 수강권 만료/환불, 비공개 수업, 제출 상태·버전 변경을 검수한다. 이 브랜치에서는 가상 DB로 자동 검사만 실행했으며 실제 DEV DB 조회는 미실시다.
3. 별도 AI 세션의 최신 코드와 합쳐 수업별 질문 진입을 연결한다. 현재 내 질문 이동만 연결했고 새 AI 호출은 없다.
4. 동료 피드백 저장/공개 범위와 로켓 발사 기준을 확정한 뒤 서버 기능을 추가한다. 봇 상태·명령도 윤익님 코드 수령 후 별도 연결한다.
5. 실제 캠퍼스 메뉴를 공개하기 전 모바일/저사양, 로그아웃 시 정리, 기존 수업·결제 회귀와 공유 DEV 검수를 마친다.

저장소 기준: 로컬 작업 HEAD `917d537a5f37ac4ac92986dd7586ce8754397e3e`. 원격을 fetch했지만 해당 HEAD를 최신 운영/DEV라고 단정하지 않는다. 실제 통합 시 운영·DEV·AI 최신 기준을 다시 대조해야 한다.

## 이번 로컬 검수

- 새 연결 검사 18건, 기존 수강권/상품 규칙 검사 9건 통과.
- TypeScript 전체 타입 검사, 변경 파일 ESLint, Next.js 프로덕션 빌드 통과.
- 로컬 빌드 서버에서 기본 OFF 경로가 실제 HTTP 404 + private/no-store로 응답함을 확인하고 시험 서버 종료.
- 첫 인계 ZIP의 SHA256 재확인: 변경 없음.
- 실제 DEV DB/RLS와 로그인된 브라우저, 윤익님 합본 화면 연결은 미검수. 프로덕션 배포·환경변수·DB·봇·AI 호출 변경 없음.

실행한 검사: `node --test tests/campus-connection.test.mjs tests/platform-rules.test.mjs`, `tsc --noEmit --incremental false`, 변경 파일 `eslint`, `npm run build`.
