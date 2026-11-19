import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {Check, ChevronDown, MessageSquare} from 'lucide-react';
import {arrivalLiveReminderConsentVersion, arrivalLiveReminderRetentionLabel} from './live-reminder-consent';
import styles from './live-reminder.module.css';

export const LIVE_REMINDER_LABEL = '강의 알림 받기';

const errors = {
  invalid: '휴대폰 번호를 확인해 주세요.',
  closed: '라이브 문자 알림 신청이 마감됐어요.',
  refresh: '신청 안내가 바뀌었어요. 페이지를 새로고침한 뒤 다시 신청해 주세요.',
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
        body: JSON.stringify({phone, consent: true, consentVersion: arrivalLiveReminderConsentVersion}),
      });
      if (response.ok && (await response.json()).registered === true) {
        form.reset();
        onRegistered();
        setSubmission('idle');
      } else {
        const errorByStatus: Record<number, keyof typeof errors> = {400: 'invalid', 409: 'refresh', 410: 'closed'};
        setSubmission(errorByStatus[response.status] ?? 'unavailable');
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
      {LIVE_REMINDER_LABEL}
      <ChevronDown className={styles.chevron} size={16} aria-hidden="true"/>
    </button>
    <div id={panelId} hidden={!open}>
      {open && <form className={styles.form} onSubmit={register} aria-busy={submission === 'pending'}>
        <fieldset disabled={submission === 'pending' || submission === 'closed' || submission === 'refresh'}>
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
          <p className={styles.note}>휴대폰 번호는 12월 7일 문샷 무료 라이브 당일 안내 문자 1회 발송에 사용해요. 브랜디액션은 신청 정보를 {arrivalLiveReminderRetentionLabel}까지 보관한 뒤 삭제해요. 문자를 발송하면 솔라피는 수신번호를 포함한 발송 기록을 발송일로부터 1년간 보관해요. 동의하지 않으면 문자 알림을 받을 수 없어요.</p>
          {message && <p id={errorId} className={styles.error} role="alert">{message}</p>}
          <div className={styles.actions}>
            <button type="submit">{submission === 'pending' ? '신청 중…' : '문자 알림 신청'}</button>
            <a href="/policies/privacy#moonshot-live-reminder" target="_blank" rel="noreferrer">개인정보 처리방침</a>
          </div>
        </fieldset>
      </form>}
    </div>
  </section>;
}
