"use client";

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import './home-consultation.css';

export type ConsultationReply = {
  text: string;
  sources: { title: string; url: string }[];
  needsStaff?: boolean;
};

export function PublicHomeConsultation() {
  async function respond(question: string): Promise<ConsultationReply> {
    const response = await fetch('/api/home-consultation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }),
    });
    if (!response.ok) throw new Error('consultation unavailable');
    return response.json();
  }
  return <HomeConsultation respond={respond} channelUrl="https://pf.kakao.com/_ydxjhxj/chat" />;
}
export function HomeConsultation({ respond, channelUrl }: {
  respond: (question: string) => Promise<ConsultationReply>;
  channelUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState<{ question: string; reply: ConsultationReply }[]>([]);
  const [error, setError] = useState(false);
  const [staffRequested, setStaffRequested] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const running = useRef(false);
  const close = () => { setOpen(false); requestAnimationFrame(() => launcher.current?.focus()); };
  const safeUrl = (value: string) => {
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
    catch { return null; }
  };
  const channel = safeUrl(channelUrl);
  const needsStaff = staffRequested || error || history.some(item => item.reply.needsStaff);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  async function submit() {
    const question = draft.trim();
    if (!question || running.current) return;
    running.current = true;
    setPending(true);
    setError(false);
    try {
      const reply = await respond(question);
      setHistory(current => [...current, { question, reply }]);
      setDraft(current => current.trim() === question ? '' : current);
    } catch { setError(true); }
    finally { running.current = false; setPending(false); }
  }

  return <div className="home-consultation">
    {open && <section className="home-consultation-panel" aria-label="에듀 이용 상담" onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
    }}>
      <header>
        <strong>에듀 이용 상담</strong>
        <button type="button" aria-label="상담창 닫기" onClick={close}><X size={20} aria-hidden="true" /></button>
      </header>
      <div className="home-consultation-messages" aria-live="polite" aria-busy={pending}>
        {!history.length && <p className="home-consultation-welcome">수강료나 준비물 등 궁금한 점을 남겨 주세요.</p>}
        {history.map((item, index) => <div className="home-consultation-turn" key={index}>
          <div className="home-consultation-question"><span>내 질문</span><p>{item.question}</p></div>
          <div className="home-consultation-answer"><span>AI 안내</span><p>{item.reply.text}</p>
            {!!item.reply.sources.length && <ul aria-label="안내 근거">{item.reply.sources.map((source, sourceIndex) => {
              const href = safeUrl(source.url);
              return href ? <li key={sourceIndex}><a href={href} target="_blank" rel="noopener noreferrer">{source.title} ↗</a></li> : null;
            })}</ul>}
          </div>
        </div>)}
        {pending && <p role="status">안내 자료를 확인하고 있어요…</p>}
        {error && <p role="alert">답변을 불러오지 못했어요. 다시 보내거나 카카오 상담을 이용해 주세요.</p>}
        {needsStaff && <div className="home-consultation-handoff"><strong>담당자와 확인해 볼까요?</strong><p>대화는 자동으로 전달되지 않아요. 필요한 내용만 직접 보내주세요.</p>{channel && <a href={channel} target="_blank" rel="noopener noreferrer">카카오 상담 열기 ↗</a>}</div>}
      </div>
      <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        <label htmlFor="home-consultation-question">궁금한 점</label>
        <textarea id="home-consultation-question" ref={input} rows={3} maxLength={1000} value={draft} onChange={event => setDraft(event.target.value)} placeholder="예: 수업은 언제부터 볼 수 있나요?" />
        <p className="home-consultation-privacy">AI가 안내해요. 비밀번호·연락처 등 개인정보는 적지 마세요.</p>
        <div><button className="home-consultation-staff" type="button" onClick={() => setStaffRequested(true)}>담당자 상담</button><button className="home-consultation-send" type="submit" disabled={!draft.trim() || pending}>{pending ? '확인 중…' : '질문 보내기'}</button></div>
      </form>
    </section>}
    {!open && <button type="button" className="home-consultation-launcher" ref={launcher} aria-expanded={false} onClick={() => setOpen(true)}>
      <MessageCircle aria-hidden="true" size={23} strokeWidth={2.2} />
      <span>에듀에 물어보세요</span>
    </button>}
  </div>;
}
