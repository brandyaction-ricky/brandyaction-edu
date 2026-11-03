/* eslint-disable @next/next/no-img-element -- Same-origin app icon in a labelled instructional diagram. */
import { ArrowUp, Home, MoreVertical, PlusSquare, Share } from 'lucide-react';
import type { InstallDevice } from '@/lib/app-install';

// These are deliberately labelled diagrams, not fabricated device screenshots.
export function InstallVisual({ device, step, homeUrl }: { device: InstallDevice; step: number; homeUrl: string }) {
  const mobile = device !== 'desktop', ios = device === 'ios';
  return <figure className={`install-visual ${mobile ? 'phone' : 'computer'}`}>
    <div className="install-visual-screen" aria-hidden="true">
      <div className="install-visual-chrome"><span className="install-chrome-symbol"/>Chrome <span>크롬</span></div>
      <div className="install-visual-toolbar"><div className={`install-visual-address ${step === 0 ? 'install-target' : ''}`}>{new URL(homeUrl).host}</div><span className={step === 2 ? 'install-target install-visual-tool' : 'install-visual-tool'}>{ios ? <Share size={21}/> : <MoreVertical size={21}/>}</span></div>
      {step === 0 && <div className="install-visual-hint"><ArrowUp size={24}/><span>주소를 여기에 붙여넣어요</span></div>}
      {step === 1 && <div className="install-visual-login"><img src="/icons/edu-192.png" width={40} height={40} alt=""/><strong>브랜디에듀 로그인</strong><span className="install-login-choice">카카오로 계속하기</span><span className="install-login-choice">구글로 계속하기</span><span className="install-login-choice">이메일로 로그인</span><small>수강 신청할 때 쓴 방법을 골라요</small></div>}
      {step === 2 && <div className="install-visual-hint toolbar-hint"><ArrowUp size={24}/><span>{ios ? '이 공유 버튼을 눌러요' : '이 점 3개를 눌러요'}</span></div>}
      {step === 3 && <div className="install-visual-menu">{ios ? <><span>복사</span><span>즐겨찾기</span><span className="install-target"><PlusSquare size={20}/>홈 화면에 추가</span></> : <><span>방문 기록</span><span>다운로드</span><span className="install-target"><Home size={20}/>설치 및 바로가기 만들기</span><span className="install-target install-submenu">설치 <ArrowUp size={18}/></span></>}</div>}
      {step === 4 && <div className="install-visual-confirm"><div><img src="/icons/edu-192.png" width={48} height={48} alt=""/><strong>브랜디에듀</strong></div><span>{new URL(homeUrl).host}</span><div className="install-visual-confirm-actions"><span>취소</span><span className="install-target">{ios ? '추가' : '설치'}</span></div></div>}
      {step !== 1 && <div className="install-visual-page"><span/><span/><span/></div>}
    </div>
    <figcaption><strong>메뉴 위치를 설명하는 그림</strong> · 실제 캡처가 아니며 기기·버전에 따라 위치가 달라요.</figcaption>
  </figure>;
}
