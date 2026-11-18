'use client';
import { useCallback, useState } from 'react';
import styles from './confirm-box.module.css';

type Ask = { message: string; yes: string; resolve: (ok: boolean) => void };
/** In-page yes/no box in place of window.confirm (browser dialogs look like a site error and block the 3D campus). */
export function useConfirmBox() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const confirm = useCallback((message: string, yes = '확인') => new Promise<boolean>(resolve => setAsk(old => { old?.resolve(false); return { message, yes, resolve }; })), []);
  const answer = (ok: boolean) => { ask?.resolve(ok); setAsk(null); };
  const box = ask && <div role="alertdialog" aria-label="확인" className={styles.box} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); answer(false); } }}>
    <p>{ask.message}</p>
    <div><button type="button" className={styles.no} onClick={() => answer(false)}>취소</button><button type="button" autoFocus className={styles.yes} onClick={() => answer(true)}>{ask.yes}</button></div>
  </div>;
  return [confirm, box] as const;
}
