'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { ArrowRight, Copy } from 'lucide-react';
import type { CompletionGuideSettings } from '@/lib/purchase-onboarding';
import './purchase-completion-guide.css';

export function PurchaseCompletionGuide({ guide, loginId }: { guide: CompletionGuideSettings; loginId?: string }) {
  const titleId = useId();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle');

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(guide.url);
      setCopyState('copied');
    } catch {
      setCopyState('manual');
    }
  }

  const account = <div className="purchase-guide-account">
    <p>결제한 계정을 꼭 기억해 주세요. 캠퍼스 입장과 커리큘럼 학습은 이 계정으로만 할 수 있어요.</p>
    {loginId
      ? <dl><dt>결제한 계정의 로그인 아이디</dt><dd dir="ltr">{loginId}</dd></dl>
      : <p>가입할 때 사용한 로그인 방법으로 같은 계정에 접속해 주세요.</p>}
  </div>;

  return <section className="purchase-completion-guide" aria-labelledby={titleId}>
    <h3 id={titleId}>{guide.label || '수강 안내'}</h3>
    {guide.message && <p className="purchase-guide-message">{guide.message}</p>}
    {guide.url ? <ol className="purchase-guide-steps">
      <li>
        <p>링크를 복사해 메모장에 보관해 주세요.</p>
        <button className="btn" type="button" onClick={copyLink}><Copy aria-hidden="true" /> 링크 복사</button>
        <div role="status">
          {copyState === 'copied' && '링크를 복사했어요.'}
          {copyState === 'manual' && '아래 링크를 직접 복사해 주세요.'}
        </div>
        {copyState === 'manual' && <input type="text" aria-label="복사할 입장 링크" readOnly value={guide.url} onFocus={event => event.currentTarget.select()} />}
      </li>
      <li>{account}</li>
      <li><a className="btn primary purchase-guide-enter" href={guide.url} referrerPolicy="no-referrer">링크 눌러 입장하기 <ArrowRight aria-hidden="true" /></a></li>
    </ol> : <>
      {account}
      <Link className="btn primary purchase-guide-enter" href="/my/classes">내 클래스 보기 <ArrowRight aria-hidden="true" /></Link>
    </>}
  </section>;
}
