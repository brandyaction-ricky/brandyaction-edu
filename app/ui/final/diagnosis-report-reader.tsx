'use client';

import { useEffect, useRef } from 'react';
import { Printer, X } from 'lucide-react';

// Match MYIN's reader isolation. Keep the issued styles/font/body unchanged;
// scripts and external requests must not run inside the EDU account origin.
const policy = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'";
export function diagnosisReaderDocument(html: string) {
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><style>.print-btn{display:none!important}</style>${html}`;
}

export function DiagnosisReportReader({ html, error, onClose, onError }: { html: string; error?: string; onClose: () => void; onError: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const reader = dialog.current, previousOverflow = document.body.style.overflow;
    reader?.showModal();
    document.body.style.overflow = 'hidden';
    frame.current?.focus({ preventScroll: true });
    return () => { reader?.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  function connectContents() {
    const document = frame.current?.contentDocument;
    // Keyboard events in the isolated report do not bubble to the parent page.
    document?.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    });
    document?.addEventListener('click', event => {
      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (!link) return;
      event.preventDefault();
      const href = link.getAttribute('href') || '';
      if (href.startsWith('#')) {
        try { document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ block: 'start' }); } catch { /* Invalid fragments do not navigate out of the report. */ }
      } else if (/^https?:\/\//.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
    });
  }
  async function print() {
    onError('');
    const popup = window.open('', '_blank');
    if (!popup) { onError('팝업이 차단되어 인쇄 창을 열지 못했습니다. 팝업을 허용한 뒤 다시 눌러 주세요.'); return; }
    try {
      popup.opener = null;
      popup.document.open(); popup.document.write(diagnosisReaderDocument(html)); popup.document.close();
      await popup.document.fonts.ready;
      if (!popup.closed) { popup.focus(); popup.print(); }
    } catch { onError('인쇄 창을 준비하지 못했습니다. 보고서를 다시 연 뒤 시도해 주세요.'); }
  }
  return <dialog ref={dialog} className="diagnosis-reader-dialog" aria-label="보고서 읽기" onCancel={event => { event.preventDefault(); onClose(); }}>
    <section className="diagnosis-report-reader" aria-label="나의 정밀 보고서">
    <div className="diagnosis-report-reader-tools"><h2>나의 정밀 보고서</h2><div>
      <button className="diagnosis-secondary" onClick={() => void print()}><Printer size={16}/>PDF로 저장 · 인쇄</button>
      <button className="diagnosis-secondary" onClick={onClose}><X size={16}/>보고서 닫기</button>
    </div></div>
    {error && <p className="diagnosis-reader-error" role="alert">{error}</p>}
    <iframe ref={frame} title="나의 N6 정밀 보고서" srcDoc={diagnosisReaderDocument(html)} sandbox="allow-same-origin" referrerPolicy="no-referrer" onLoad={connectContents}/>
    </section>
  </dialog>;
}
