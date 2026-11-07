---
name: "moonshot-campus-report"
description: "지정 Telegram 직원 대화에서 '캠퍼스 업무:'로 시작하는 요청을 수행할 때 문샷 캠퍼스 개인 사무실에 업무 시작과 실제 결과를 보고한다. 일반 대화·다른 봇·이전 업무에는 사용하지 않는다."
---

# 문샷 캠퍼스 업무 보고

이 스킬은 작업 중 짧은 보고 명령만 실행한다. 감시 프로그램·예약 작업·새 서버를 실행하지 않는다. 보고는 직원의 자기 보고이며, PC가 꺼지거나 Aside가 중단될 때 전달을 보장하는 시스템 훅이 아니다.

## 범위와 준비

- 실제로 받은 `캠퍼스 업무:` 요청 한 건만 보고한다. 일반 대화·과거 기록·키·비밀번호·고객 개인정보를 보내지 않는다. 해당 요청에 필요한 결과만 제출한다.
- 현재 대화의 `aside`와 `channel` 공식 스킬을 먼저 읽는다. REPL의 `await aside.sessions.current()`와 `channel.current()`에서 현재 세션/연결/Telegram 메시지 식별자를 얻는다. 식별자를 만들어 내거나 다른 작업의 값을 복사하지 않는다.
- `aside.sessions.messages(session.id, {limit:20,order:'desc'})`에서 해당 사용자 요청의 본문·timestamp를 확인한다. 메시지가 모호하거나 현재 요청을 확인할 수 없으면 보고를 멈춘다.
- 연결 설정은 `<accountRoot>/campus-office/connection.json`이다. accountRoot는 이 SKILL.md의 실제 경로에서 `skills/user/moonshot-campus-report`를 제거한 위치다. 설정 파일·키 파일을 읽어서 출력하지 않는다. 아래 보고 스크립트만 설정을 소비한다. 연결이 없으면 담당자에게 연결 준비가 필요하다고 알린다.
- 기존 Node 런타임으로 실행한다. Node가 없거나 권한이 부족하면 설치·권한 확대를 임의로 하지 말고 미연결 상태를 알린다. 이 스킬은 학생용 자격 발급·설치 마법사가 아니다.

## 실행 절차

1. 현재 작업 폴더에 보고 입력 JSON을 만든다. `context`는 `{platform:'telegram', sessionId:session.id, connectionId:session.trigger.connectionId, channelId:channel.current().channelId, messageId:channel.current().messageId, requestedAt:사용자요청.timestamp}`이다. 같은 업무에서는 이 값을 고정해 재사용한다.
2. 실제 업무에 착수하기 직전 `{action:'start', context, requestText:실제사용자요청본문}`을 저장하고 아래 명령을 실행한다. 성공 응답을 확인해야 캠퍼스에 시작을 보고했다고 말할 수 있다.
   `node <this-skill-dir>/scripts/report.mjs <accountRoot>/campus-office/connection.json <입력JSON절대경로>`
3. 사용자가 요청한 업무를 실제로 수행한다. 중간 진행은 채팅으로 설명할 수 있지만 가짜 완료율이나 외부 실행 성공을 만들지 않는다. 이번 연결은 시작·결과 두 시점 보고이며 세부 단계별 진척률은 지원하지 않는다.
4. 최종 답변을 완성하면 `{action:'result', context, resultText:최종답변원문}`을 별도 JSON에 저장하고 같은 명령을 실행한다. 결과는 10~10,000자다. 캠퍼스에는 사용자 검토 대상으로 저장되며 승인이 아니다. 성공을 확인한 뒤 Telegram에도 같은 결과를 답한다. 보고용 메타 설명은 결과 본문과 구분한다.
5. 실제 오류로 업무를 수행하지 못했다면 `{action:'failed', context, failureNote:확인한오류설명}`을 전송한다. 강제 종료로 보고가 불가능했던 일을 보고했다고 주장하지 않는다.

## 재시도·중단

- 보고가 실패하면 캠퍼스 반영 여부 미확인임을 알린다. `action:'retry'`와 같은 context를 입력해 저장된 보고만 다시 보낼 수 있다. 새 요청 ID를 만들거나 업무를 다시 실행하지 않는다. 무한 재시도하지 말고 1회 재시도 후 실패하면 대화에 알린다.
- 원문 변경·다른 연결·완료 결과 덮어쓰기 거절은 우회하지 않는다. 수정 업무는 사용자가 새로 지시하도록 한다.
- 보고 확인 실패를 AI 업무 자체의 실패로 단정하지 않는다. Telegram 대화의 최종 결과는 사용자에게 제공하되 캠퍼스 전송 실패를 분리해 알린다.
- PC가 꺼지거나 스킬 호출이 누락되면 마지막 상태가 남을 수 있다. 현재 온라인·항상 작동·자동 복구를 보장하지 않는다.
- 다른 스킬·전역 지침·권한 설정·봇 설정을 바꾸지 않는다. 보호된 개발 Preview에서만 사용하는 Vercel CLI 인증은 학생에게 요구하는 연결 방식이 아니다.
