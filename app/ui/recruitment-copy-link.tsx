'use client';
import { useRef, useState } from 'react';
import { AdminButton, AdminInput } from '@/features/admin-ui';
import './recruitment-help.css';

export function RecruitmentCopyLink({ label, value, blocked = '', usage }: { label: string; value: string; blocked?: string; usage: string }) {
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ value: string; text: string } | null>(null);
  const copy = async () => {
    if (blocked || !value || busy.current) return;
    busy.current = true; setPending(true); setNotice(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(value);
      setNotice({ value, text: `${label}를 복사했습니다. 게시·발송은 직접 진행해 주세요.` });
    } catch {
      input.current?.focus(); input.current?.select();
      setNotice({ value, text: '자동 복사를 사용할 수 없습니다. 주소를 길게 누르거나 선택한 뒤 직접 복사해 주세요.' });
    } finally { busy.current = false; setPending(false); }
  };
  return <div className="recruitment-copy-link">
    <div className="recruitment-copy-row"><AdminInput ref={input} label={label} value={value} readOnly onFocus={event => event.currentTarget.select()} /><AdminButton disabled={Boolean(blocked) || !value || pending} aria-label={`${label} 복사`} onClick={() => void copy()}>{pending ? '복사 중…' : '링크 복사'}</AdminButton></div>
    <p>{blocked || usage}</p>
    {!blocked && notice?.value === value && <p role="status">{notice.text}</p>}
  </div>;
}
