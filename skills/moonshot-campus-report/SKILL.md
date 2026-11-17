---
name: "moonshot-campus-report"
description: "Telegram 개인 대화의 '캠퍼스 연결 준비'와 '캠퍼스 연결 확인'을 처리하고, 연결한 Telegram 직원에게 글 작성·조사·요약·정리 등 실제 일을 맡기면 접두어 없이 문샷 캠퍼스 개인 사무실에 업무 시작과 실제 결과를 보고한다. 일반 대화·다른 봇·이전 업무에는 사용하지 않는다."
---

# 문샷 캠퍼스 업무 보고

이 스킬은 작업 중 짧은 보고 명령만 실행한다. 감시 프로그램·예약 작업·새 서버를 실행하지 않는다. 보고는 직원의 자기 보고이며, PC가 꺼지거나 Aside가 중단될 때 전달을 보장하는 시스템 훅이 아니다.

## 수강생이 직접 연결할 때

본인만 사용하도록 설정한 Telegram 직원 개인 대화에서 정확히 `캠퍼스 연결 준비` 또는 `캠퍼스 연결 확인 <12자리 확인번호>`를 받으면 아래의 공식 Aside·channel 정보에서 실제 현재 context를 구한다. 현재 요청의 원문을 requestText로 하고 context와 함께 작업 폴더의 `campus-connect-<메시지ID>.json` 파일 하나에 저장한다. 이 파일을 넣을 폴더를 새로 만들지 않는다. `node <this-skill-dir>/scripts/campus-student-device.mjs <accountRoot> <입력JSON절대경로>`를 실행한다. 준비 단계는 10분짜리 pairingCode를 알려 주고, 연결을 확인하면 이 직원에게 평소 말로 맡긴 업무의 요약과 결과가 개인 사무실에 기록된다고 안내한다. 일반 대화는 기록하지 않는다. 사용자가 캠퍼스의 내 AI 직원에서 코드를 입력한 다음, 같은 대화에서 확인번호를 보내면 확인 명령을 실행한다. connected가 true일 때만 연결을 알린다. 키 파일을 열거나 전송하지 않는다. 연결 명령은 업무로 등록하지 않는다. 연결 해제는 캠퍼스의 해당 직원 카드에서 한다. 연결은 이 봇과 이 채팅방에 묶이므로 `/new`로 대화를 새로 시작해도 그대로 유지된다. 연결 명령에 쓴 입력 JSON은 스크립트가 지우며, 작업 폴더에 보고용 파일이나 폴더를 따로 남기지 않는다. 연결 파일을 `<accountRoot>/campus-office`에 쓸 수 없다는 오류가 나면 권한을 임의로 넓히지 말고, 사용자에게 Aside 앱의 File permissions에 그 폴더를 추가(허용)한 뒤 `/new`를 보내고 다시 `캠퍼스 연결 준비`를 보내 달라고 안내한다.

## 범위와 준비

- 현재 개인 대화에서 사용자가 이 직원에게 실제로 맡긴 일을 판단한다. “공지 초안 써줘”, “이 표를 정리해 줄래?”처럼 할 일과 결과물이 분명하면 바로 시작한다. 짧은 부탁도 맥락에서 대상과 결과물이 분명하면 업무다. 일반 질문(“AI 직원이 뭐야?”), 인사, 감사, 상태 문의, 연결 명령, 인용한 예시는 대화로만 답한다. 대상이나 실행 의도가 모호하면 대화에서 먼저 확인한다.
- “사무실에 기록하지 마”처럼 기록을 원하지 않는다고 분명히 말한 경우에만 보고하지 않는다. “답장으로 줘”처럼 결과를 받는 방법만 말한 경우는 평소처럼 보고한다.
- 업무 요약과 결과에는 이 직원이 이번에 맡은 일만 쓴다. 같은 Aside에 연결된 다른 봇·다른 대화·다른 사업·고객사의 이름이나 진행 중인 다른 대화 수는 넣지 않는다. 전체 직원 현황을 요청받으면 사용자가 알려 준 수업 직원(담당자 목록)만 대상으로 하고, Aside 연결 목록 전체를 직원으로 세지 않는다.
- 보고가 성공했으면 Telegram 답장에서 캠퍼스 기록·작업함·보고용 파일(`campus-start-…json` 등)을 언급하지 않는다. 결과만 답한다. 시작 파일은 결과 제출 뒤 스크립트가 지운다.
- 보고 명령이 오류로 끝나면 명령이 `⚠️ 캠퍼스 사무실에는 기록되지 않았어요.`로 시작하는 안내 줄을 출력한다. **이 줄을 답장의 맨 첫 줄에 글자 그대로 쓴다.** 답장 끝에 붙이지 않는다. 조용히 넘어가지 않는다. 원인을 추측하거나 다른 안내(“연결은 성공했어요”, “카드를 확인해 보세요”, “운영 쪽에 알리세요” 등)를 지어서 덧붙이지 않는다. 그 아래에 맡은 일의 결과를 평소처럼 답한다.
- **답장 전체를 사용자가 이번 요청에 쓴 언어로 쓴다.** 한국어로 맡긴 일에는 머리말·선택지 이름·설명·맺음말까지 모두 한국어로 쓰고, 영어 문장을 섞지 않는다(“Option 2. Why this item …”처럼 쓰지 않는다). 이 스킬의 명령이 출력하는 영어 영수증이나 오류를 답장에 옮겨 쓰지 않는다. 결과물도 같은 언어로 쓴다. 요청·결과에 키, 비밀번호, 고객 개인정보가 있으면 그대로 보내지 않는다. 안전한 업무 요약과 결과를 분리할 수 없으면 대화에만 답한다.
- 접두어 없는 업무는 새 스킬로 직접 연결한 개인 직원에서만 보고한다. 예전 연결에서는 기존 `캠퍼스 업무:` 방식을 계속 쓸 수 있고, 평소 말로 보고하려면 새 스킬에서 다시 연결한다.
- 현재 대화의 `aside`와 `channel` 공식 스킬을 먼저 읽는다. REPL의 `await aside.sessions.current()`와 `channel.current()`에서 현재 세션/연결/Telegram 메시지 식별자를 얻는다. 식별자를 만들어 내거나 다른 작업의 값을 복사하지 않는다.
- `aside.sessions.messages(session.id, {limit:20,order:'desc'})`에서 해당 사용자 요청의 본문·timestamp를 확인한다. 메시지가 모호하거나 현재 요청을 확인할 수 없으면 보고를 멈춘다.
- 연결 설정은 `<accountRoot>/campus-office/connection.json`이다. accountRoot는 이 SKILL.md의 실제 경로에서 `skills/user/moonshot-campus-report`를 제거한 위치다. 설정 파일·키 파일을 읽어서 출력하지 않는다. 아래 보고 스크립트만 설정을 소비한다. 연결이 없으면 담당자에게 연결 준비가 필요하다고 알린다.
- 기존 Node 런타임으로 실행한다. Node가 없거나 권한이 부족하면 설치·권한 확대를 임의로 하지 말고 미연결 상태를 알린다.

## 실행 절차

**시작 보고를 먼저 보낸다.** 위 기준에 맞는 업무라면 초안 작성, 자료 조회, 부가 스킬 선택은 시작 보고가 성공한 뒤 진행한다. 이미 읽은 공식 Aside·channel 안내는 같은 세션에서 재사용한다.

1. 공식 REPL에서 아래 블록을 한 번 실행한다. `expected`에 현재 사용자가 실제 보낸 문장, `objective`에 개인정보를 뺀 업무 요약(10~2,000자), `outputType`에 결과물 종류 하나를 넣는다: 실행 계획 `plan`, 글·문구 초안 `copy`, 점검 목록 `checklist`, 조사·요약·분석 `analysis`. 가장 최근 사용자 메시지가 현재 문장과 다르면 중단한다. 이전 업무 파일을 사용하지 않는다.

   ```js
   {
     const expected = '현재 요청 원문', objective = '업무와 결과물 요약', outputType = 'analysis';
     const session = await aside.sessions.current(), channelInfo = await channel.current();
     const rows = await aside.sessions.messages(session.id, {limit:20, order:'desc'});
     const user = rows.find(row => row.role === 'user');
     const text = typeof user?.content === 'string' ? user.content : user?.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n');
     if (text !== expected || channelInfo.platform !== 'telegram' || !/^telegram:[1-9]\d*$/.test(channelInfo.channelId) || !session.trigger?.connectionId || !channelInfo.messageId || !Number.isFinite(user.timestamp)) throw Error('현재 개인 대화의 요청을 확인하세요.');
     const context = {platform:'telegram', sessionId:session.id, connectionId:session.trigger.connectionId, channelId:channelInfo.channelId, messageId:String(channelInfo.messageId), requestedAt:user.timestamp};
     const file = path.join(pwd, 'campus-start-'+encodeURIComponent(session.id)+'-'+encodeURIComponent(context.messageId)+'.json');
     await fs.writeFile(file, JSON.stringify({action:'start', context, requestText:text, taskObjective:objective, outputType}), {flag:'wx', mode:0o600});
     console.log(file);
   }
   ```

2. 방금 출력된 파일로 다음 명령을 실행한다. 이후 같은 턴에서 동일한 파일 경로를 사용한다. 같은 요청 재시도는 기존 파일을 보존하고 아래 재시도 절차를 따른다.

   `node <this-skill-dir>/scripts/report.mjs <accountRoot>/campus-office/connection.json <이번-시작-파일>`

3. 시작 영수증을 받은 뒤 실제 업무를 수행한다. 시작·결과 두 시점만 보고한다. 최종 원문을 별도 파일에 다시 쓰거나 대화 식별자를 다시 조회할 필요 없이 한 번의 bash 호출로 제출한다. 아래 종료 구분자는 결과 본문 어느 줄과도 겹치지 않게 선택하며, 따옴표를 유지해 본문을 셸이 해석하지 않도록 한다.

   ```sh
   node <this-skill-dir>/scripts/report.mjs <accountRoot>/campus-office/connection.json <이번-시작-파일> --result-stdin <<'CAMPUS_RESULT_END'
   사용자에게 줄 실제 완성 원문
   CAMPUS_RESULT_END
   ```

4. 성공 영수증을 확인하고 Telegram에도 같은 결과를 답한다. 보내기 전에 답장의 모든 문장이 사용자가 쓴 언어인지 확인한다. 기록됐다는 말이나 파일 이야기는 덧붙이지 않는다. 결과는 10~10,000자로 사용자 검토 대상이다. 파일 기반 기존 result·failed·retry 입력과 동일한 권한 확인·중복 방지를 사용한다. 실제 실패는 기존 JSON 형식 `{action:'failed',context,failureNote}`로 확인한 오류만 보고한다.

## 재시도·중단

- 보고가 실패하면 위 규칙대로 답장 첫 줄에 명령이 출력한 안내 줄을 쓴다. `action:'retry'`와 같은 context를 입력해 저장된 보고만 다시 보낼 수 있다. 새 요청 ID를 만들거나 업무를 다시 실행하지 않는다. 무한 재시도하지 말고 1회 재시도 후 실패하면 대화에 알린다.
- 원문 변경·다른 연결·완료 결과 덮어쓰기 거절은 우회하지 않는다. 수정 업무는 사용자가 새로 지시하도록 한다.
- 보고 확인 실패를 AI 업무 자체의 실패로 단정하지 않는다. Telegram 대화의 최종 결과는 사용자에게 제공하되 캠퍼스 전송 실패를 분리해 알린다.
- PC가 꺼지거나 스킬 호출이 누락되면 마지막 상태가 남을 수 있다. 현재 온라인·항상 작동·자동 복구를 보장하지 않는다.
- 다른 스킬·전역 지침·권한 설정·봇 설정을 바꾸지 않는다. 보호된 개발 Preview에서만 사용하는 Vercel CLI 인증은 학생에게 요구하는 연결 방식이 아니다.
