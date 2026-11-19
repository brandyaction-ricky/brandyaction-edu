'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { retentionDays } from '@/lib/crm-retention';
import { defaultLearningReminderDays, type LearningReminderAction, type LearningReminderChoice, type LearningReminders } from '@/lib/learning-reminders';
import styles from './learning-reminder-settings.module.css';

const endpoint = '/api/platform/learning-reminders';
const label = { member_inactive: '방문 알림', learning_stalled: '진도 알림' };
const activity = { member_inactive: '새 강의실 방문 기록이 확인되면', learning_stalled: '수업 일차를 완료하면' };
const dateTime = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' });
const statuses = { pending: '신청됨', cancelled: '취소됨', activity: '학습 활동 확인으로 종료', elapsed: '확인 기간 종료' };

function ReminderChoice({ choice, enrollmentId, disabled, submit }: {
  choice: LearningReminderChoice;
  enrollmentId: string;
  disabled: boolean;
  submit: (action: LearningReminderAction) => Promise<void>;
}) {
  const [days, setDays] = useState(String(defaultLearningReminderDays));
  const attempt = useRef<{ days: number; id: string } | null>(null);
  const { kind, request } = choice;
  const name = label[kind];
  const pending = request?.status === 'pending';
  const dayCount = Number(days);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!retentionDays(dayCount) || disabled) return;
    attempt.current = attempt.current?.days === dayCount ? attempt.current : { days: dayCount, id: crypto.randomUUID() };
    void submit({ action: 'request', enrollmentId, kind, days: dayCount, requestId: attempt.current.id }).then(() => {
      attempt.current = null;
    }, () => {});
  }

  return <div className={styles.choice}>
    <div>
      <h4>{name}</h4>
      <p>확인 기간 안에 {activity[kind]} 이 신청은 종료돼요.</p>
      {request && <p><strong>{statuses[request.status]}</strong> · {request.days}일 · {dateTime.format(new Date(request.dueAt))}까지</p>}
    </div>
    {pending ? <button type="button" className="btn small" disabled={disabled} aria-label={`${name} 신청 취소`}
      onClick={() => void submit({ action: 'cancel', requestId: request.id }).catch(() => {})}>신청 취소</button>
      : choice.eligible ? <form className={styles.actions} onSubmit={apply}>
        <label>확인 기간 <input type="number" min="1" max="365" value={days} required disabled={disabled}
          aria-label={`${name} 확인 기간(일)`} onChange={event => setDays(event.target.value)} /> 일</label>
        <button className="btn primary small" type="submit" disabled={disabled || !retentionDays(dayCount)}>{name} 1회 신청</button>
      </form> : <p className={styles.unavailable}>{kind === 'member_inactive' ? '강의실 방문 기록이 있어야 신청할 수 있어요.' : '진행할 수업이 있을 때 신청할 수 있어요.'}</p>}
  </div>;
}

export function LearningReminderSettings() {
  const [data, setData] = useState<LearningReminders | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok || !Array.isArray(result?.courses)) throw new Error();
      setData(result);
      setError('');
    }).catch(() => {
      if (!controller.signal.aborted) setError('학습 알림 상태를 불러오지 못했어요.');
    });
    return () => controller.abort();
  }, [retry]);

  async function submit(action: LearningReminderAction) {
    if (submitting.current) throw new Error();
    submitting.current = true;
    setPending(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) });
      const next = await response.json();
      if (!response.ok || !Array.isArray(next?.courses)) {
        setError(next?.error || '신청 상태를 확인하지 못했어요. 다시 시도해 주세요.');
        throw new Error();
      }
      const nextState = next as LearningReminders;
      setData(nextState);
      if (action.action === 'cancel') {
        const cancelled = nextState.courses.some(course => course.choices.some(choice =>
          choice.request?.id === action.requestId && choice.request.status === 'cancelled'));
        setMessage(cancelled ? '신청을 취소했어요.' : '현재 신청 상태를 확인해 주세요.');
      } else {
        const request = nextState.courses.find(course => course.enrollmentId === action.enrollmentId)?.choices
          .find(choice => choice.kind === action.kind)?.request;
        setMessage(request?.id === action.requestId && request.status === 'pending'
          ? '1회 신청을 저장했어요.' : request?.status === 'pending' ? '이미 신청한 알림이 있어요.' : '현재 신청 상태를 확인해 주세요.');
      }
    } catch (cause) {
      setError(current => current || '신청 상태를 확인하지 못했어요. 다시 시도해 주세요.');
      throw cause;
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <section id="learning-reminders" className={`panel pad mt24 ${styles.section}`} aria-labelledby="learning-reminder-title">
    <h3 id="learning-reminder-title">카카오톡 학습 알림</h3>
    <p>지금은 신청과 취소만 기록해요. 카카오톡은 발송되지 않아요.</p>
    {data ? <>
      {data.courses.length ? <p>계정에 등록된 번호 {data.maskedPhone || '없음'}</p> : <p>신청할 수 있는 수강 중인 유료 클래스가 없어요.</p>}
      {data.courses.map(course => <fieldset key={course.enrollmentId} className={styles.course}>
        <legend>{course.courseTitle} · {course.cohortName}</legend>
        {course.choices.map(choice => <ReminderChoice key={choice.kind} choice={choice} enrollmentId={course.enrollmentId}
          disabled={pending} submit={submit} />)}
      </fieldset>)}
    </> : !error && <p role="status">신청 내역을 불러오는 중…</p>}
    {error && <p role="alert" className={styles.error}>{error} <button type="button" className="btn small" disabled={pending}
      onClick={() => { setError(''); setRetry(value => value + 1); }}>다시 불러오기</button></p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
