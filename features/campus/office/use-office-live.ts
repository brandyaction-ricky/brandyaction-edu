'use client';
import { useEffect, useRef, useState } from 'react';
import { observeOffice } from './shared-inbox';
import { joinOfficeInbox, readOfficeVersion } from './inbox-channel';

type Options = {
  enabled: boolean;
  keepConnected?: boolean;
  enrollment: string | null | undefined;
  refresh: (signal?: AbortSignal) => Promise<void>;
  onError: () => void;
  slow: boolean;
};

export function useOfficeLive({ enabled, keepConnected = false, enrollment, refresh, onError, slow }: Options) {
  const [connected, setConnected] = useState(false);
  const latest = useRef({ enabled, refresh, onError, slow });
  const current = useRef<ReturnType<typeof observeOffice> | undefined>(undefined);
  const read = useRef<AbortController | undefined>(undefined);
  const participate = enabled || keepConnected;

  useEffect(() => {
    latest.current = { enabled, refresh, onError, slow };
    if (enabled) current.current?.invalidate();
    return () => read.current?.abort();
  }, [enabled, refresh, onError, slow]);

  useEffect(() => {
    function disconnect() {
      read.current?.abort();
      current.current?.close();
      current.current = undefined;
    }

    function updateVisibility() {
      disconnect();
      setConnected(false);
      if (!participate || !enrollment || document.visibilityState !== 'visible') return;
      const isDev = process.env.NEXT_PUBLIC_APP_ENV === 'development' &&
        process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://vjmjhaidlqkmascdjocw.supabase.co';
      current.current = observeOffice(enrollment, {
        refresh: async () => {
          if (!latest.current.enabled) return;
          const controller = new AbortController();
          read.current = controller;
          try {
            await latest.current.refresh(controller.signal);
          } catch {
            if (!controller.signal.aborted) latest.current.onError();
          }
        },
        connected: setConnected,
        slow: () => !latest.current.enabled || latest.current.slow,
      }, isDev ? async (signal, ready, failed, changed) => {
        const { createClient } = await import('@/lib/supabase/client');
        if (!signal.aborted) await joinOfficeInbox(createClient(), enrollment, signal, ready, failed, changed);
      } : undefined, isDev ? async signal => {
        const { createClient } = await import('@/lib/supabase/client');
        return signal.aborted ? 0 : readOfficeVersion(createClient(), enrollment, signal);
      } : undefined);
    }

    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      document.removeEventListener('visibilitychange', updateVisibility);
      disconnect();
    };
  }, [participate, enrollment]);
  return connected;
}
