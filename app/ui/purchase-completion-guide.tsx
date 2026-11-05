'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { ArrowRight, Copy } from 'lucide-react';
import type { CompletionGuideSettings } from '@/lib/purchase-onboarding';
import './purchase-completion-guide.css';

export function PurchaseCompletionGuide({ guide, loginId, loginMethod, preview = false }: {
  guide: CompletionGuideSettings;
  loginId?: string;
  loginMethod?: string;
  preview?: boolean;
}) {
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
    {loginId
      ? <dl><dt>결제한 계정의 로그인 아이디</dt><dd dir="ltr">{loginId}{loginMethod && <span> ({loginMethod})</span>}</dd></dl>
      : <p>가입할 때 사용한 로그인 방법{loginMethod && ` (${loginMethod})`}으로 같은 계정에 접속해 주세요.</p>}
    <p className="purchase-guide-hint">이 계정으로 캠퍼스에 입장하고 커리큘럼을 학습할 수 있어요.</p>
  </div>;

  return <section className="purchase-completion-guide" aria-labelledby={titleId}>
    <h3 id={titleId}>{guide.label || '수강 안내'}</h3>
    {guide.message && <p className="purchase-guide-message">{guide.message}</p>}
    {guide.url ? <ol className="purchase-guide-steps" role="list">
      <li>
        <span className="purchase-guide-number" aria-hidden="true">1</span>
        <div className="purchase-guide-step">
          <h4>입장 링크 보관</h4>
          <p className="purchase-guide-hint">링크를 복사해 메모장에 보관해 주세요.</p>
          <div className="purchase-guide-link">
            <p className="purchase-guide-url" dir="ltr">{guide.url}</p>
            <button className="btn" type="button" disabled={preview} onClick={copyLink}><Copy aria-hidden="true" /> 링크 복사</button>
          </div>
          {!preview && <div role="status">
            {copyState === 'copied' && '링크를 복사했어요.'}
            {copyState === 'manual' && '표시된 링크를 직접 복사해 주세요.'}
          </div>}
        </div>
      </li>
      <li>
        <span className="purchase-guide-number" aria-hidden="true">2</span>
        <div className="purchase-guide-step">
          <h4>결제 계정 확인</h4>
          {account}
        </div>
      </li>
      <li className="purchase-guide-last-step">
        <span className="purchase-guide-number" aria-hidden="true">3</span>
        <a className="btn primary purchase-guide-enter" href={preview ? undefined : guide.url} aria-disabled={preview || undefined} referrerPolicy="no-referrer">링크 눌러 입장하기 <ArrowRight aria-hidden="true" /></a>
      </li>
    </ol> : <>
      {account}
      {preview
        ? <span className="btn primary purchase-guide-enter" aria-disabled="true">내 클래스 보기 <ArrowRight aria-hidden="true" /></span>
        : <Link className="btn primary purchase-guide-enter" href="/my/classes">내 클래스 보기 <ArrowRight aria-hidden="true" /></Link>}
    </>}
  </section>;
}
