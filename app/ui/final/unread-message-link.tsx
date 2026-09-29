"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import './unread-message-link.css';
export function UnreadMessageLink({ userId, className = 'link' }: { userId: string; className?: string }) {
  const [state, setState] = useState<{ owner: string; count: number }>();
  useEffect(() => {
    let alive = true, request: AbortController | undefined, timeout: ReturnType<typeof setTimeout> | undefined;
    function refresh() {
      if (document.visibilityState === 'hidden') return;
      request?.abort(); clearTimeout(timeout); const controller = new AbortController(); request = controller;
      timeout = setTimeout(() => controller.abort(), 5000);
      void fetch('/api/member/messages?action=unread', { cache: 'no-store', signal: controller.signal })
        .then(async response => { if (!response.ok) return; const data = await response.json(); if (alive && !controller.signal.aborted && Number.isSafeInteger(data.count) && data.count >= 0) setState({ owner: userId, count: data.count }); })
        .catch(() => {}).finally(() => { if (request === controller) clearTimeout(timeout); });
    }
    refresh(); const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh); window.addEventListener('edu-messages-read', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { alive = false; request?.abort(); clearTimeout(timeout); clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('edu-messages-read', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [userId]);
  const count = state?.owner === userId ? state.count : 0;
  return <Link className={className + ' unread-message-link'} href="/my/messages" aria-label={count ? `메시지 · 안 읽음 ${count}개` : '메시지'}>
    <MessageCircle size={20} aria-hidden="true"/><span className="message-link-label">메시지</span>{count > 0 && <span className="unread-message-count" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
  </Link>;
}
