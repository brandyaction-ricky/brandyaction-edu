'use client';
import { useEffect, useState } from 'react';
import { adRejectionSaved, rejectPersonalizedAds } from '@/lib/ad-preferences';

export function AdPreferences() {
  const [state, setState] = useState<'loading' | 'available' | 'saved' | 'unsaved'>('loading');
  useEffect(() => {
    const update = () => setState(current => adRejectionSaved() ? 'saved' : current === 'unsaved' ? 'unsaved' : 'available');
    update();
    window.addEventListener('focus', update);
    return () => window.removeEventListener('focus', update);
  }, []);
  const reject = () => setState(rejectPersonalizedAds().saved ? 'saved' : 'unsaved');
  return <section id="advertising" className="privacy-ad-settings" aria-labelledby="privacy-ad-title" tabIndex={-1}>
    <span className="privacy-eyebrow">이 브라우저의 설정</span>
    <h2 id="privacy-ad-title">맞춤형 광고 설정</h2>
    <p>Meta(페이스북·인스타그램)는 이 사이트의 방문·클릭 기록을 광고 측정과 맞춤형 광고에 사용합니다.</p>
    <p>원하지 않으면 아래 버튼을 눌러 주세요. 로그인·결제·수강은 그대로 이용할 수 있어요.</p>
    {state === 'saved' ? <p role="status" className="privacy-ad-saved">맞춤형 광고를 거부했어요. 이 브라우저에서는 Meta로 방문·클릭 기록을 보내지 않습니다.</p>
      : <button className="btn" disabled={state === 'loading'} onClick={reject}>맞춤형 광고 거부</button>}
    {state === 'unsaved' && <p role="alert">이 페이지에서는 전송을 껐지만 설정을 저장하지 못했어요. 다음에 방문하면 다시 눌러 주세요. 브라우저에서 쿠키 저장을 허용하면 설정을 저장할 수 있어요.</p>}
    <p className="privacy-setting-note">설정은 1년 동안 저장됩니다. 다른 기기나 브라우저에서는 다시 눌러 주세요. 카카오톡·인스타그램 안에서 연 화면도 각각 설정해야 합니다.</p>
  </section>;
}
