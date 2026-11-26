# 에듀 수강생 여정 사용성 QA — 화면 명세 v1.0

2026년 11월 26일. 캠퍼스 PR #568의 a881ec5d를 기반으로 수강생과 직원의 수업 입장과 복귀를 검수했다. 제품 소스 기준은 3acfae2f다. 저장소에는 STATE.md가 없어 PR 이력과 적용 소스를 대조했다. [OS 검수 보고서](https://brandyaction-os.vercel.app/knowledge/doc/83590da4-4ea1-43f8-8234-4ecf019359f6)

수강생은 권한이 있는 수업을 열고, 본문을 읽고, 완료 후 다음 수업으로 이어갈 수 있어야 한다. 여러 기수에 속한 사용자와 직원도 지금 고른 기수를 확인할 수 있어야 한다.

## 1. 변경 목록

| ID | 화면 | 적용 파일 | 동작 규칙 및 관련 발견 |
| --- | --- | --- | --- |
| S1 | 캠퍼스 입장 | app/campus/enter/page.tsx, app/campus/workspace/page.tsx | 자신의 유효한 수강권과 선택한 기수로 입장한다. 실제 수강권을 가진 직원도 같은 규칙을 사용한다. #1 |
| S2 | 커리큘럼 검수와 공부방 | features/campus/ui/entry-bar.tsx, features/campus/tour/preview.tsx, lib/staff-curriculum-review-server.ts | 현재 수업의 입장 목적지와 복귀할 기수를 맞춘다. 검수만 가능한 기수는 미리보기로 표시한다. 과거 기수의 복귀 링크를 재사용하지 않는다. #1 |
| S3 | 강의실과 직원·협력자 검수 | app/ui/final/classroom.tsx, app/ui/final/staff-curriculum-review.tsx | 키보드로 목차를 건너뛰면 본문 제목이 보이고 다음 Tab이 본문으로 이어진다. #2 |
| S4 | 작업 이동과 목차 | app/ui/final/lesson-pages.tsx, app/ui/final/lesson-block-view.tsx | 다음 작업으로 이동하거나 맨 위로 돌아온 뒤 초점을 화면 위치와 함께 옮긴다. #3 |
| S5 | 로그인과 계정 복구 | app/ui/email-auth.tsx, app/ui/find-email.tsx, lib/email-auth.ts | 양식의 첫 입력, 잘못된 칸, 조회 결과 순으로 초점을 맞추고 입력을 바로잡으면 경고를 갱신한다. #4 |
| S6 | 질문, FAQ, 쿠폰, N6, AI 대화 | app/ui/final/lesson-questions.css, app/ui/final/app-install.css, app/ui/final/diagnosis-report.css, app/ui/final/diagnosis-questionnaire.css, app/ui/final/curriculum-ai.css, design-reference/source/frontend/src/experience.css | 좁은 터치 기기에서 실제 누를 수 있는 면적과 본문 높이를 확보한다. #5·6·8 |

## 2. 지킬 것

선택한 기수의 공개 수업, 본인의 유효한 권한, 기존 진도 및 이전 방으로 돌아가기. 개강 전 일정, 만료·회수된 권한에 대한 기존 차단, 직원의 검수 열람과 실제 수강을 각각 유지한다.

## 3. 합격 기준

- [x] [확인] 로컬 가상 수강생 1,024개 조합의 첫 진입, 첫 본문, 완료 또는 제출, 다음 수업, 뒤로 가기 또는 새로고침, 재진입을 모두 통과했다. 완료 쓰기 1회씩, 측정한 3,072개 화면의 가로 넘침 0px.
- [x] [확인] 24회차 PC 목차의 본문 접근 27 Tab에서 2 Tab과 Enter. 네 역할의 320px 펼친 목차는 1 Tab과 Enter.
- [x] [확인] 320px·390px·834px에서 멘토 질문 및 AI 안내와 N6 이전 문항을 실제 눌러 동작과 44px 이상 높이를 확인했다.
- [x] [확인] 320px·글자 125%에서 N6 보고서의 인쇄와 닫기가 한 줄에 있고 본문 높이는 460px 이상.
- [ ] [모름] 실제 DEV 수강생·직원·협력자 계정의 조합 및 실제 휴대폰의 음성 스크린리더.

## 4. 결정 및 확인

| 구분 | 담당 | 기준 |
| --- | --- | --- |
| D1 | 개발 | 수강 중인 기수에서는 실제 작업 공간, 검수 권한만 있는 기수에서는 미리보기와 공개 수업을 제공한다. |
| C1 | 검수 담당 | 보호 DEV에서 세 역할의 입장·복귀를 대조하고 실제 사용자에 대한 권한 변경은 별도 업무로 처리한다. |
| C2 | 운영 담당 | 원격 검사 및 DEV 결과를 확인한 다음 고정 버전의 운영 반영을 별도 승인한다. |

