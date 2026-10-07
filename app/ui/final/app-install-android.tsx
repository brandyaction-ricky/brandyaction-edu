/* eslint-disable @next/next/no-img-element -- Local instructional artwork and attributed Google reference captures. */
import { ArrowUp, ChevronRight, Download, History, Home, MoreVertical, Plus, Search, Share2, Smartphone, Star } from 'lucide-react';

const reference = 'https://developer.chrome.com/blog/how_chrome_helps_users_install_the_apps_they_value';
const examples: Record<number, string> = { 2: 'menu', 4: 'choices', 5: 'confirm' };
// Korean instructional reconstruction, not a Galaxy device capture. Labels follow current Chrome Help.
export function AndroidInstallVisual({ step, homeUrl }: { step: number; homeUrl: string }) {
  const host = new URL(homeUrl).host;
  return <figure className="install-android">
    <div className="install-android-screen" aria-hidden="true">
      <div className="install-android-browser"><Home size={20}/><div className={step === 0 ? 'install-target' : ''}>{host}</div><span className={step === 2 ? 'install-target' : ''}><MoreVertical size={24}/></span></div>
      {step === 0 && <div className="install-android-pointer"><ArrowUp size={22}/>위 주소 칸에 붙여넣어요</div>}
      {step === 2 && <div className="install-android-pointer right"><ArrowUp size={22}/>점 3개를 눌러요</div>}
      <div className="install-android-page"><img src="/icons/edu-192.png" width={40} height={40} alt=""/><strong>브랜디에듀</strong>
        {step === 1 ? <><p>평소 쓰던 방법으로 로그인하세요</p><span className="install-android-kakao">카카오로 계속하기</span><span>Google 계정으로 계속하기</span><span>이메일로 로그인</span></> : <><p>내 클래스</p><div className="install-android-course">내 강의 이어서 학습하기</div></>}
      </div>
      {step === 3 && <div className="install-android-menu">
        <span><Plus size={18}/>새 탭</span><span><History size={18}/>방문 기록</span><span><Download size={18}/>다운로드</span><span><Star size={18}/>북마크</span><hr/><span><Share2 size={18}/>공유...</span><span><Search size={18}/>페이지에서 찾기</span><span className="install-target"><Smartphone size={18}/>설치 및 바로가기 만들기</span><span>데스크톱 사이트</span>
      </div>}
      {step === 4 && <div className="install-android-sheet"><div className="install-android-handle"/><strong>설치 및 바로가기 만들기</strong><div className="install-android-option install-target"><img src="/icons/edu-192.png" width={36} height={36} alt=""/><b>설치</b><ChevronRight size={20}/></div><div className="install-android-option"><Smartphone size={28}/><span>바로가기 만들기<small>Chrome에서 열립니다</small></span><ChevronRight size={20}/></div></div>}
      {step === 5 && <div className="install-android-confirm"><strong>앱 설치</strong><div><img src="/icons/edu-192.png" width={44} height={44} alt=""/><span><b>브랜디에듀</b><small>{host}</small></span></div><footer><span>취소</span><span className="install-target">설치</span></footer></div>}
      {step >= 3 && <div className="install-android-shade"/>}
      {(step === 3 || step === 4 || step === 5) && <div className="install-android-tap">빨간 테두리 안을 눌러요</div>}
    </div>
    <figcaption>Google 공식 안내를 바탕으로 구성한 한글 예시입니다. 기기·버전에 따라 모양과 메뉴 이름이 달라요.</figcaption>
    {examples[step] && <details className="install-android-reference"><summary>Google의 실제 화면 예시 보기 (영문)</summary><p>아래는 Google이 공개한 다른 사이트의 예시입니다. 내 화면에서는 브랜디에듀 이름과 주소를 확인하세요.</p><img src={`/installation-guide/android-google-${examples[step]}.png`} width={738} height={1600} alt={step === 2 ? 'Google 공식 Android Chrome 화면: 주소 칸 오른쪽 점 세 개' : step === 4 ? 'Google 공식 예시: Add to home screen 하단 창의 Install 선택' : 'Google 공식 예시: 앱 이름과 주소를 확인한 뒤 Install 버튼 선택'} loading="lazy"/><p><a href={reference} target="_blank" rel="noopener noreferrer">Google Chrome Developers · 원본(2024)</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> · 이미지 변경 없음</p></details>}
  </figure>;
}
