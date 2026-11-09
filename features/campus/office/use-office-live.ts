'use client';
import { useEffect, useRef, useState } from 'react';
import { startInboxSync } from './inbox-sync';
import { joinOfficeInbox } from './inbox-channel';

type Options = {
  enabled: boolean;
  enrollment: string | null | undefined;
  refresh: (signal?: AbortSignal) => Promise<void>;
  onError: () => void;
  slow: boolean;
};

export function useOfficeLive({ enabled, enrollment, refresh, onError, slow }: Options) {
  const [connected, setConnected] = useState(false);
  const latest = useRef({ refresh, onError, slow });
  const current = useRef<ReturnType<typeof startInboxSync> | undefined>(undefined);

  useEffect(() => {
    latest.current = { refresh, onError, slow };
    current.current?.invalidate();
  }, [refresh, onError, slow]);

  useEffect(() => {
    const updateVisibility = () => {
      current.current?.close();
      current.current = undefined;
      setConnected(false);
      if (!enabled || !enrollment || document.visibilityState !== 'visible') return;
      const isDev = process.env.NEXT_PUBLIC_APP_ENV === 'development' &&
        process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://vjmjhaidlqkmascdjocw.supabase.co';
      const inbox = startInboxSync({
        refresh: signal => latest.current.refresh(signal),
        onError: () => latest.current.onError(),
        onConnected: setConnected,
        slow: () => latest.current.slow,
        join: isDev ? async (signal, ready, failed) => {
          const { createClient } = await import('@/lib/supabase/client');
          if (!signal.aborted) await joinOfficeInbox(createClient(), enrollment, signal, ready, failed, inbox.invalidate);
        } : undefined,
      });
      current.current = inbox;
    };
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      document.removeEventListener('visibilitychange', updateVisibility);
      current.current?.close();
      current.current = undefined;
    };
  }, [enabled, enrollment]);
  return connected;
}
