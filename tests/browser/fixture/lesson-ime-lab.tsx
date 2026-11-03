import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LessonBlockAuthorFixture } from './lesson-block-author';
import { installInternalClipboardLab } from './internal-clipboard-api';
import { LessonRichInput } from '../../../app/ui/final/lesson-rich-input';
import '../../../app/ui/final/admin.css';

// Standalone synthetic screen: no credentials, real APIs or external requests.
window.fetch = async () => Response.json({ error: '가상 검수에서는 실제 API에 연결하지 않습니다.' }, { status: 403 });
installInternalClipboardLab();

function Lab() {
  const [basic, setBasic] = useState(false), [text, setText] = useState('기존 문장을 지운 뒤 입력');
  return <>
    <header style={{ padding: 20, background: '#fff7df', borderBottom: '2px solid #b48734' }}>
      <h1>가상 한글 입력 검수</h1>
      <p>실제 수업·회원과 연결되지 않습니다. 입력과 저장은 이 탭에만 남고 새로 열면 초기화됩니다.</p>
      <p>Mac의 Aside에서 새 빈 줄, 기존 문장 삭제 후, 이동 손잡이 클릭 후에 ‘가나다’를 입력해 주세요. 모바일에서는 화면 확인만 할 수 있습니다.</p>
      <button type="button" onClick={() => setBasic(false)}>현재 수정본</button>{' '}
      <button type="button" onClick={() => setBasic(true)}>기본 서식 편집기 비교</button>
    </header>
    {basic ? <div className="edu-admin" style={{ padding: 20 }}><LessonRichInput value={text} onChange={setText} label="수업 문서" /></div> : <LessonBlockAuthorFixture />}
  </>;
}
createRoot(document.getElementById('root')!).render(<Lab />);
