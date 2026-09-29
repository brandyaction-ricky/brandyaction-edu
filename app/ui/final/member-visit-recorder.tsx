'use client';
import { useEffect } from 'react';
import { koreanDay, VISIT_INTERVAL_MS } from '@/lib/member-visits';

// Shared between route remounts; nothing is kept in cookies/localStorage.
const receipts = new Map<string, { day: string; lastSuccess: number; lastAttempt: number; pending: boolean }>();
export function MemberVisitRecorder({ member, enabled = process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true' }: { member: string; enabled?: boolean }) {
  useEffect(() => {
    if (!enabled || !member) return;
    const record = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now(), day = koreanDay(now), previous = receipts.get(member);
      if (previous?.pending || (previous && now - previous.lastAttempt < 60_000) || (previous?.day === day && now - previous.lastSuccess < VISIT_INTERVAL_MS)) return;
      const current = { day, lastSuccess: previous?.day === day ? previous.lastSuccess : 0, lastAttempt: now, pending: true };
      receipts.set(member, current);
      // Authenticated server identity/time are authoritative. A failed analytics
      // request must never block learning, logout the user, or expose data.
      void fetch('/api/platform/member-visit', { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10_000) })
        .then(response => { if (response.ok) current.lastSuccess = Date.now(); })
        .catch(() => {}).finally(() => { current.pending = false; });
    };
    record(); const timer = setInterval(record, 60_000);
    document.addEventListener('visibilitychange', record); window.addEventListener('focus', record);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', record); window.removeEventListener('focus', record); };
  }, [enabled, member]);
  return null;
}
