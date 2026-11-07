'use client';
import { useState } from 'react';
export function OfficeConnectionGuide() {
  const [notice, setNotice] = useState('');
  const example = '캠퍼스 업무: 내 사업의 고객을 이해하기 위해 먼저 확인할 질문 세 가지를 정리해 주세요. 외부 게시나 메시지 전송은 하지 마세요.';
  return <details><summary>Telegram 업무를 사무실에서 확인하는 방법</summary>
    <p>현재는 개발 검수용 연결입니다. 봇 주소를 배치하는 것과 작업 보고를 연결하는 것은 별도 단계예요.</p>
    <ol>
      <li>내 PC의 Aside에서 내 Telegram 봇을 연결하고, 본인만 사용할 수 있도록 설정하세요.</li>
      <li>검수 담당자가 내 수강권과 직원 대화를 연결한 뒤, PC에서 보고 프로그램을 실행합니다. 봇 토큰을 캠퍼스에 입력하지 않습니다.</li>
      <li>지정한 직원 대화에 <strong>캠퍼스 업무:</strong>로 시작하는 요청을 보내세요. 이전 업무가 끝난 다음 새 업무를 보내 주세요.</li>
      <li>이 작업함에서 접수·실행·결과를 확인하고 직접 검토하세요. 캠퍼스를 닫아도 보고 프로그램이 켜진 PC에서는 계속 보고할 수 있습니다.</li>
    </ol>
    <p>PC가 꺼지거나 보고 프로그램이 종료되면 새 소식은 들어오지 않아요. 저장된 실행 상태는 PC의 현재 접속 상태를 보증하지 않습니다. 개발 검수 프로그램은 한 번에 최대 30분 실행합니다.</p>
    <button type="button" onClick={() => void navigator.clipboard.writeText(example).then(() => setNotice('업무 예시를 복사했어요. 지정한 직원의 개인 대화에 붙여 넣으세요.')).catch(() => setNotice('자동 복사가 되지 않았어요. 아래 예시를 직접 복사해 주세요.'))}>업무 예시 복사</button>
    <p>{example}</p>{notice && <p role="status">{notice}</p>}
  </details>;
}
