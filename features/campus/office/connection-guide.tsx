'use client';
import { useState } from 'react';
export function OfficeConnectionGuide() {
  const [notice, setNotice] = useState('');
  const example = '내 사업의 고객을 이해하기 위해 먼저 확인할 질문 세 가지를 정리해 주세요. 외부 게시나 메시지 전송은 하지 마세요.';
  return <details><summary>Telegram 업무를 사무실에서 확인하는 방법</summary>
    <p>현재는 개발 검수용 연결입니다. 봇 주소를 배치하는 것과 작업 보고를 연결하는 것은 별도 단계예요.</p>
    <ol>
      <li>내 PC의 Aside에서 내 Telegram 봇을 연결하고, 본인만 사용할 수 있도록 설정하세요.</li>
      <li>개발 캠퍼스의 내 AI 직원에서 보고 스킬을 받고, 직원 대화와 화면의 연결 코드를 차례로 확인하세요. 봇 토큰을 캠퍼스에 입력하지 않습니다.</li>
      <li>연결한 직원의 개인 대화에 “이번 주 수업 공지 써줘”처럼 해야 할 일을 부탁하세요. 일반 질문과 인사는 작업함에 쌓이지 않아요. 이전 업무가 끝난 다음 새 업무를 보내 주세요.</li>
      <li>직원이 스킬로 보고한 시작 상태와 결과를 이 작업함에서 확인하고 직접 검토하세요. 캠퍼스를 닫아도 Aside가 업무를 수행하는 PC에서 보고할 수 있습니다.</li>
    </ol>
    <p>별도 감시 프로그램을 계속 켜 둘 필요는 없어요. 다만 스킬 호출이 빠지거나 PC·Aside가 종료되면 보고가 누락될 수 있습니다. 저장된 실행 상태는 현재 온라인 상태가 아니며, 모든 세부 진행 단계가 자동 기록되지는 않습니다.</p>
    <p>개발 캠퍼스의 내 AI 직원에서 연결을 해제할 수 있어요. 이전 업무 기록은 작업함에 남아요.</p>
    <button type="button" onClick={() => void navigator.clipboard.writeText(example).then(() => setNotice('업무 예시를 복사했어요. 지정한 직원의 개인 대화에 붙여 넣으세요.')).catch(() => setNotice('자동 복사가 되지 않았어요. 아래 예시를 직접 복사해 주세요.'))}>업무 예시 복사</button>
    <p>{example}</p>{notice && <p role="status">{notice}</p>}
  </details>;
}
