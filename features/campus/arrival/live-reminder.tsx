import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {Check, ChevronDown, MessageSquare} from 'lucide-react';
import styles from './live-reminder.module.css';

const errors = {
  invalid: '휴대폰 번호를 확인해 주세요.',
  closed: '라이브 문자 알림 신청이 마감됐어요.',
  unavailable: '지금은 신청하기 어려워요. 잠시 후 다시 시도해 주세요.',
} as const;

type Submission = 'idle' | 'pending' | keyof typeof errors;

export function LiveReminder({open, registered, onOpenChange, onRegistered}: {
  open: boolean;
  registered: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistered: () => void;
}) {
  const panelId = useId();
  const phoneHintId = useId();
  const errorId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const confirmation = useRef<HTMLParagraphElement>(null);
  const inFlight = useRef(false);
  const [submission, setSubmission] = useState<Submission>('idle');

  useEffect(() => {
    if (!open) return;
    if (registered) {
      confirmation.current?.focus();
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      trigger.current?.focus({preventScroll: true});
      trigger.current?.scrollIntoView({block: 'start', inline: 'nearest', behavior: 'instant'});
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, registered]);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const phone = String(data.get('phone') ?? '').trim();
    if (data.get('consent') !== 'on' || inFlight.current || submission === 'closed') return;
    if (!phone) {setSubmission('invalid'); return;}
    inFlight.current = true;
    setSubmission('pending');
    try {
      const response = await fetch('/api/campus/arrival/live-reminder', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({phone, consent: true}),
      });
      if (response.ok && (await response.json()).registered === true) {
        form.reset();
        onRegistered();
        setSubmission('idle');
      } else {
        setSubmission(response.status === 400 ? 'invalid' : response.status === 410 ? 'closed' : 'unavailable');
      }
    } catch {
      setSubmission('unavailable');
    } finally {
      inFlight.current = false;
    }
  }

  if (registered) return <p ref={confirmation} className={styles.success} role="status" tabIndex={-1}><Check size={17} aria-hidden="true"/>문자 알림을 신청했어요.</p>;
  const message = submission === 'idle' || submission === 'pending' ? '' : errors[submission];
  return <section className={styles.section}>
    <button ref={trigger} className={styles.trigger} type="button" aria-controls={panelId} aria-expanded={open}
      onClick={() => {
        if (open && (submission === 'invalid' || submission === 'unavailable')) setSubmission('idle');
        onOpenChange(!open);
      }}>
      <MessageSquare size={17} aria-hidden="true"/>
      라이브 당일 문자 받기
      <ChevronDown className={styles.chevron} size={16} aria-hidden="true"/>
    </button>
    <div id={panelId} hidden={!open}>
      {open && <form className={styles.form} onSubmit={register} aria-busy={submission === 'pending'}>
        <p className={styles.note}>미리보기에서는 신청만 확인할 수 있어요.</p>
        <fieldset disabled={submission === 'pending' || submission === 'closed'}>
          <div className={styles.phoneField}>
            <label className={styles.phone}>휴대폰 번호
              <input name="phone" type="tel" inputMode="tel" autoComplete="off" placeholder="010-0000-0000"
                maxLength={32} required aria-invalid={submission === 'invalid' || undefined}
                aria-describedby={submission === 'invalid' ? `${phoneHintId} ${errorId}` : phoneHintId}
                onChange={() => {if (submission === 'invalid') setSubmission('idle');}}/>
            </label>
            <p id={phoneHintId} className={styles.note}>010-0000-0000과 01000000000 모두 가능해요.</p>
          </div>
          <label className={styles.consent}>
            <input name="consent" type="checkbox" required/>
            라이브 당일 안내 문자 1회 수신에 동의합니다.
          </label>
          {message && <p id={errorId} className={styles.error} role="alert">{message}</p>}
          <div className={styles.actions}>
            <button type="submit">{submission === 'pending' ? '신청 중…' : '문자 알림 신청'}</button>
            <a href="/policies/privacy" target="_blank" rel="noreferrer">개인정보 처리방침</a>
          </div>
        </fieldset>
      </form>}
    </div>
  </section>;
}
