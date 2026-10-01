'use client';

import { useState } from 'react';
import { emptyRecruitmentAnnouncement, incompleteRecruitmentAnnouncement, recruitmentAnnouncement, type RecruitmentAnnouncementFields } from '@/lib/recruitment-announcement';
import { AdminButton, AdminInput, AdminSection } from '@/features/admin-ui';
import './recruitment-announcement.css';

const fields: { key: keyof RecruitmentAnnouncementFields; label: string; placeholder: string }[] = [
  { key: 'material1', label: '즉시 공개 자료', placeholder: '예: AI 광고 영상 샘플북' },
  { key: 'material2', label: '두 번째 자료', placeholder: '예: AI 직원 팀 설계도' },
  { key: 'material2Date', label: '두 번째 자료 공개일', placeholder: '예: 19일' },
  { key: 'material3', label: '세 번째 자료', placeholder: '예: AI 작업별 선택 가이드' },
  { key: 'material3Date', label: '세 번째 자료 공개일', placeholder: '예: 26일' },
  { key: 'materialsUrl', label: '자료 받는 링크', placeholder: 'https://...' },
  { key: 'liveDate', label: '라이브 날짜', placeholder: '예: 9/28 (월)' },
  { key: 'liveTime', label: '라이브 시간', placeholder: '예: 오후 9시' },
  { key: 'bonus1', label: '추가 혜택 1', placeholder: '예: AI 활용 리포트' },
  { key: 'bonus2', label: '추가 혜택 2', placeholder: '예: 세팅 가이드' },
  { key: 'bonus3', label: '추가 혜택 3', placeholder: '예: 스킬 자료집' },
  { key: 'passwordUrl', label: '비밀번호 링크', placeholder: 'https://...' },
];

export function RecruitmentAnnouncement() {
  const [draft, setDraft] = useState<RecruitmentAnnouncementFields>(emptyRecruitmentAnnouncement);
  const [notice, setNotice] = useState('');
  const preview = recruitmentAnnouncement(draft);
  const incomplete = incompleteRecruitmentAnnouncement(draft);
  async function copy() {
    try {
      await navigator.clipboard.writeText(preview);
      setNotice(incomplete ? '빈칸이 포함된 공지를 복사했습니다. 발송 전에 대괄호 부분을 채워 주세요.' : '완성된 공지를 복사했습니다. 카톡방에 붙여넣기 전에 내용을 확인해 주세요.');
    } catch {
      setNotice('복사가 안 되면 아래 문안을 직접 선택해 복사해 주세요.');
    }
  }
  return <AdminSection className="recruitment-announcement" title="카톡방 공지 만들기" description="자료명과 날짜를 입력하면 아래 공지 전체에 바로 반영됩니다. 카톡방으로 자동 발송되지는 않습니다." bordered>
    <div className="recruitment-announcement-fields">
      {fields.map(field => <AdminInput key={field.key} label={field.label} placeholder={field.placeholder} value={draft[field.key]} onChange={event => { setDraft(current => ({ ...current, [field.key]: event.target.value })); setNotice(''); }}/>) }
    </div>
    <label className="recruitment-announcement-preview">복사할 공지 미리보기
      <textarea readOnly value={preview} rows={24} onFocus={event => event.currentTarget.select()} />
    </label>
    <div className="recruitment-announcement-actions"><AdminButton onClick={() => void copy()}>{incomplete ? '빈칸 포함 공지 복사' : '완성된 공지 복사'}</AdminButton><span>입력한 값은 저장되지 않습니다. 다른 모집에는 새로 입력해 주세요.</span></div>
    {notice && <p role="status">{notice}</p>}
  </AdminSection>;
}
