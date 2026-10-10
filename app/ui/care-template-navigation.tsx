'use client';
import { useState } from 'react';
import { ArrowLeft, ExternalLink, MessageSquare, Settings2 } from 'lucide-react';
import { CARE_ALIMTALK_BODY, CARE_SMS_BODY } from '@/lib/learning-care-channels';
import './care-template-navigation.css';

export type CareTemplateChannel = 'sms' | 'alimtalk';
export function CareTemplateLinks({ disabled, onOpen, onRefresh }: { disabled: boolean; onOpen: () => void; onRefresh: () => void }) {
  const [opened, setOpened] = useState(false);
  return <section className="care-template-tools" aria-label="문자·알림톡 템플릿 관리">
    <div className="care-template-tools-heading"><Settings2 size={16} aria-hidden="true"/><strong>문자·알림톡 템플릿</strong><span>새 탭에서 관리</span></div>
    <div className="care-template-actions">{(['sms','alimtalk'] as const).map(channel => <a key={channel} className="btn" href={`/admin/templates?from=learning-care&channel=${channel}`} target="_blank" rel="noopener noreferrer" aria-disabled={disabled} tabIndex={disabled ? -1 : undefined} onClick={event => { if(disabled) { event.preventDefault(); return; } setOpened(true); onOpen(); }}>
      {channel === 'sms' ? '문자 템플릿 관리' : '알림톡 템플릿 관리'}<ExternalLink size={14} aria-hidden="true"/>
    </a>)}</div>
    <p>받는 사람과 작성 내용은 이 창에 그대로 남아요. 관리가 끝나면 이 창으로 돌아와 주세요.</p>
    {opened && <div className="care-template-return" role="status"><span>관리 후 발송 가능 여부를 다시 확인해 주세요.</span><button type="button" className="btn" disabled={disabled} onClick={()=>{setOpened(false);onRefresh();}}>설정 확인하고 이어서 작성</button></div>}
  </section>;
}

export function CareTemplateContext({ channel, dirty, pending }: { channel: CareTemplateChannel; dirty: boolean; pending: boolean }) {
  const [closeAttempted, setCloseAttempted] = useState(false);
  const sms = channel === 'sms';
  return <section className="care-template-context panel pad mb24" aria-label="학습 안내에서 연 템플릿 관리">
    <div className="care-template-context-top"><div><p className="care-template-eyebrow">학습 안내 → 템플릿 관리</p><h2><MessageSquare size={20} aria-hidden="true"/>{sms ? '문자' : '알림톡'} 템플릿 관리</h2></div>
      <button type="button" className="btn" disabled={pending || dirty} onClick={() => { setCloseAttempted(true); window.close(); }}><ArrowLeft size={16} aria-hidden="true"/>관리 창 닫고 돌아가기</button>
    </div>
    <p>원래 학습 안내 창에 받는 사람과 작성 내용이 남아 있습니다. 돌아간 뒤 <strong>‘설정 확인하고 이어서 작성’</strong>을 눌러 주세요.</p>
    {dirty && <p role="status">수정한 템플릿을 먼저 저장해 주세요. 저장하지 않고 돌아가려면 이 탭을 직접 닫아 주세요.</p>}
    {closeAttempted && <p role="status">창이 닫히지 않으면 이 탭을 닫고, 처음 열었던 학습 안내 탭으로 돌아가 주세요.</p>}
    <details className="care-template-current"><summary>현재 학습 안내에 사용하는 {sms ? '문자' : '알림톡'} 문구</summary>
      <pre>{sms ? CARE_SMS_BODY : CARE_ALIMTALK_BODY}</pre>
      <p>{sms ? '학습 안내 문자는 위 고정 문구로 발송합니다. 아래 일반 문자 템플릿을 저장해도 이 문구가 바뀌지는 않습니다.' : '학습 안내 알림톡은 위 문구의 카카오 승인과 학습 안내용 연결이 필요합니다. 아래에 저장하는 것만으로 발송이 켜지지는 않습니다.'} 상세 안내는 수강생 메시지함에서 확인합니다.</p>
    </details>
  </section>;
}
