'use client';
/* eslint-disable @next/next/no-img-element -- Same-origin app icon and original installation screenshot. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, MoreVertical, Share } from 'lucide-react';
import type { InstallDevice } from '@/lib/app-install';
import { InstallVisual } from './app-install-visual';

type Step = { title: string; action: ReactNode; help?: ReactNode };
const sources: Record<InstallDevice, string> = {
  desktop: 'https://support.google.com/chrome/answer/9658361?hl=ko&co=GENIE.Platform%3DDesktop',
  android: 'https://support.google.com/chrome/answer/9658361?hl=ko&co=GENIE.Platform%3DAndroid',
  ios: 'https://support.google.com/chrome/answer/15085120?hl=ko&co=GENIE.Platform%3DiOS',
};
export function AppInstallGuide({ device, homeUrl }: { device: InstallDevice; homeUrl: string }) {
  const [selected, setSelected] = useState(device), [index, setIndex] = useState(0), [copied, setCopied] = useState('');
  const heading = useRef<HTMLHeadingElement>(null), moveFocus = useRef(false), stepId = useId();
  useEffect(() => { if (moveFocus.current) { heading.current?.focus(); moveFocus.current = false; } }, [index, selected]);
  function changeStep(next: number) { moveFocus.current = true; setIndex(next); }
  function choose(value: InstallDevice) { moveFocus.current = true; setSelected(value); setIndex(0); setCopied(''); }
  async function copy() {
    try { await navigator.clipboard.writeText(homeUrl); setCopied('주소를 복사했어요. 크롬을 열고 주소 칸에 붙여넣으세요.'); }
    catch { setCopied('자동 복사가 안 됐어요. 아래 주소를 길게 누르거나 선택해서 직접 복사하세요.'); }
  }
  const address = <div className="app-install-address"><label>크롬에서 열 주소<input aria-label="안내할 사이트 주소" readOnly value={homeUrl}/></label><button type="button" className="btn small" onClick={() => void copy()}><Copy size={16} aria-hidden="true"/>주소 복사</button>{copied && <p role="status">{copied}</p>}</div>;
  const steps: Step[] = [
    { title: '크롬으로 브랜디에듀를 열어요', action: <><strong>Chrome(크롬)</strong> 앱을 열고 아래 주소를 주소 칸에 붙여넣으세요.{address}</>, help: <>카카오톡·텔레그램 안에서 보고 있다면 주소를 먼저 복사한 뒤 크롬을 직접 여세요.</> },
    { title: '평소 쓰던 계정으로 로그인해요', action: <>수강 신청할 때 쓴 <strong>카카오·구글·이메일 계정</strong>으로 브랜디에듀에 로그인하세요.</>, help: <>이미 내 강의가 보이면 다음 단계로 가세요. 새로 가입하거나 다시 결제할 필요는 없어요. 크롬에서 구글 계정 동기화를 시작하라는 뜻이 아니에요.</> },
    selected === 'ios'
      ? { title: '주소 칸 옆의 공유 버튼을 눌러요', action: <>크롬 주소 칸 오른쪽의 <strong>공유 <Share size={20} className="app-install-inline-icon" aria-hidden="true"/></strong>를 누르세요. 네모 위로 화살표가 올라가는 모양이에요.</>, help: <>주소 칸이 화면 아래에 있으면 그 옆에서 찾으세요.</> }
      : { title: '크롬 오른쪽 위 점 3개를 눌러요', action: <>사이트 안의 메뉴가 아니라, <strong>크롬 주소 칸 오른쪽의 <MoreVertical size={20} className="app-install-inline-icon" aria-hidden="true"/> 점 3개</strong>를 누르세요.</> },
    selected === 'ios'
      ? { title: '‘홈 화면에 추가’를 눌러요', action: <>공유 목록을 아래로 내려 <strong>‘홈 화면에 추가’</strong>를 누르세요.</>, help: <>안 보이면 목록 맨 아래 ‘동작 편집’에서 찾아보세요. 그래도 없으면 크롬과 iOS 업데이트를 확인하세요.</> }
      : selected === 'android'
        ? { title: '아이콘을 추가하는 메뉴를 눌러요', action: <><strong>‘설치 및 바로가기 만들기’ → ‘설치’</strong>를 누르세요.</>, help: <>버전에 따라 ‘홈 화면에 추가’ 또는 ‘앱 설치’라고 보일 수 있어요. ‘앱에서 열기’가 보이면 이미 추가된 아이콘을 열 수 있어요.</> }
        : { title: '‘페이지를 앱으로 설치’를 눌러요', action: <><strong>① ‘캐스팅, 저장, 공유’ → ② ‘페이지를 앱으로 설치’</strong>를 누르세요.</>, help: <>‘전송, 저장 및 공유’라고 보일 수도 있어요. ‘브랜디에듀에서 열기’가 보이면 이미 설치된 상태예요. 그 메뉴를 눌러 열어보세요.</> },
    { title: selected === 'ios' ? '오른쪽 위 ‘추가’를 눌러요' : '설치 창의 ‘설치’를 눌러요', action: <>브랜디에듀 이름과 사이트 주소를 확인하고 <strong>{selected === 'ios' ? '‘추가’' : '‘설치’ 또는 ‘추가’'}</strong>를 누르세요.</>, help: selected === 'desktop' ? <>‘다음’ 버튼이 먼저 보이면 누른 뒤 남은 안내를 끝내세요.</> : selected === 'ios' ? <>‘웹 앱으로 열기’가 보이면 켜 둔 채로 추가하세요.</> : <>휴대폰에서 한 번 더 물어보면 ‘추가’를 누르세요.</> },
  ];
  const finished = index === steps.length, step = steps[index];
  return <div className="app-install-guide mt16">
    <p className="app-install-picker-label">지금 사용하는 기기를 골라 주세요</p>
    <div className="app-install-devices" role="group" aria-label="앱을 추가할 기기">{([['ios', '아이폰·아이패드'], ['android', '갤럭시·안드로이드'], ['desktop', '컴퓨터']] as const).map(([value, label]) => <button key={value} type="button" className="btn small" aria-pressed={selected === value} onClick={() => choose(value)}>{label}</button>)}</div>
    <p className="app-install-route">크롬으로 열기 <span aria-hidden="true">→</span> 로그인 <span aria-hidden="true">→</span> 아이콘 추가</p>
    <div className="app-install-step" aria-labelledby={stepId}>
      <div className="app-install-progress" aria-label={finished ? '아이콘 열어보기' : `총 ${steps.length}단계 중 ${index + 1}단계`}>{steps.map((_, i) => <span key={i} className={i <= index ? 'active' : ''} aria-hidden="true"/>)}<span>{finished ? '마지막으로 열어보기' : `${index + 1} / ${steps.length}`}</span></div>
      <div className="app-install-step-heading"><span className="app-install-step-icon" aria-hidden="true">{finished ? <Check/> : index + 1}</span><h3 id={stepId} ref={heading} tabIndex={-1}>{finished ? '아이콘을 눌러 내 강의를 열어보세요' : step.title}</h3></div>
      {finished ? <><div className="app-install-finish"><img src="/icons/edu-192.png" width={64} height={64} alt="빨간색 브랜디에듀 아이콘"/><div><strong>브랜디에듀</strong><p>{selected === 'desktop' ? 'Windows는 시작 메뉴, Mac은 앱 목록이나 Dock에서 찾아보세요.' : '휴대폰 홈 화면에서 찾아보세요.'}</p></div></div><p>아이콘을 누른 뒤 <strong>‘내 클래스’</strong>에서 강의를 열어보세요. 로그인 화면이 나오면 평소 쓰던 계정으로 로그인하면 돼요.</p><p className="app-install-step-help">{selected === 'android' ? '아이콘이 안 보이면 첫 화면을 아래에서 위로 쓸어 앱 목록에서도 찾아보세요.' : selected === 'ios' ? '아이콘이 안 보이면 홈 화면을 옆으로 넘겨 보세요. 앱 보관함에서도 찾을 수 있어요.' : '바탕화면에 없어도 설치에 실패한 것은 아니에요. 아래 ‘컴퓨터 바탕화면에도 두고 싶어요’를 확인하세요.'}</p><p className="app-install-step-help">기존 아이콘이 열리지 않아 새로 추가했다면, <strong>새 아이콘으로 강의가 열리는지 확인한 뒤</strong> 예전 아이콘을 정리하세요.</p><button type="button" className="btn small" onClick={() => changeStep(0)}>처음부터 다시 보기</button></> : <><div className="app-install-step-action">{step.action}</div>{selected === 'desktop' && index === 3 ? <InstallScreenshot/> : <InstallVisual device={selected} step={index} homeUrl={homeUrl}/>} {step.help && <p className="app-install-step-help">{step.help}</p>}<div className="app-install-step-nav"><button type="button" className="btn" disabled={index === 0} onClick={() => changeStep(index - 1)}><ArrowLeft size={16} aria-hidden="true"/>이전</button><button type="button" className="btn primary" onClick={() => changeStep(index + 1)}>{index === steps.length - 1 ? '아이콘 찾는 법 보기' : '다음 단계'}<ArrowRight size={16} aria-hidden="true"/></button></div></>}
    </div>
    <div className="app-install-faq" aria-label="자주 묻는 질문">
      <details><summary>크롬이 없어요</summary><p>컴퓨터는 <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer">구글 공식 사이트</a>, 휴대폰은 앱스토어·플레이스토어에서 <strong>Google Chrome</strong>을 찾아 설치하세요. 스토어에서 찾는 것은 크롬이에요. 브랜디에듀는 크롬으로 열어 아이콘을 추가해요.</p></details>
      <details><summary>앱스토어에서 검색해도 안 나와요</summary><p>브랜디에듀는 앱스토어·플레이스토어에서 다운로드하는 앱이 아니에요. 위 순서대로 사이트 아이콘만 만들면 돼요. 따로 결제할 필요가 없어요.</p></details>
      <details><summary>새로 가입하거나 결제해야 하나요?</summary><p>아니요. <strong>수강 신청할 때 쓴 계정</strong>으로 로그인하세요. 카카오로 신청했다면 ‘카카오로 계속하기’를 누르세요. 로그인 이메일을 변경했다면 바꾼 이메일과 브랜디에듀 비밀번호를 쓰세요. 기존 강의와 학습 기록은 그대로예요.</p></details>
      <details><summary>기존 아이콘을 누르면 브라우저에 로그인하래요</summary><p>예전에 다른 브라우저에서 만든 아이콘일 수 있어요. 크롬을 직접 열고 위 순서대로 새 아이콘을 추가하세요. 새 아이콘으로 강의가 열리는지 확인한 뒤 기존 아이콘을 정리하세요. 브랜디에듀 계정을 새로 만들 필요는 없어요.</p></details>
      {selected === 'desktop' && <details><summary>컴퓨터 바탕화면에도 두고 싶어요</summary><p>크롬 주소 칸에 <code>chrome://apps</code>를 입력하세요. 브랜디에듀 아이콘을 오른쪽 클릭 → ‘바로가기 만들기’ → 표시할 위치를 선택하세요. 해당 메뉴가 없으면 Windows 시작 메뉴 또는 Mac 앱 목록에서 브랜디에듀를 찾아 사용하세요.</p></details>}
      <details><summary>메뉴를 못 찾겠어요. 꼭 추가해야 하나요?</summary><p>꼭 추가하지 않아도 돼요. 지금처럼 사이트에서 강의를 볼 수 있어요. 크롬으로 열었는지 먼저 확인하세요. 기기·버전에 따라 메뉴 위치가 다를 수 있어요.</p><a href={sources[selected]} target="_blank" rel="noopener noreferrer">내 기기의 크롬 공식 안내 보기</a></details>
      <details><summary>아이콘을 추가하면 인터넷 없이도 볼 수 있나요?</summary><p>강의와 자료를 보려면 인터넷 연결이 필요해요. 아이콘은 브랜디에듀를 쉽게 여는 바로가기예요.</p></details>
    </div>
  </div>;
}
function InstallScreenshot() {
  const dialog = useRef<HTMLDialogElement>(null), label = useId();
  const picture = <div className="app-install-photo-marked"><img src="/installation-guide/chrome-menu.webp" width={1100} height={699} alt="실제 Mac 크롬 메뉴: 오른쪽 캐스팅, 저장, 공유를 고르면 왼쪽에 페이지를 앱으로 설치가 나타납니다." loading="lazy"/><span className="app-install-photo-target first" aria-hidden="true"><b>1</b></span><span className="app-install-photo-target second" aria-hidden="true"><b>2</b></span></div>;
  return <figure className="app-install-shot"><button type="button" className="app-install-shot-button" aria-label="크롬 설치 메뉴 사진 크게 보기" onClick={() => dialog.current?.showModal()}>{picture}<span className="app-install-photo-zoom">사진 크게 보기 ↗</span></button><figcaption>실제 Mac 크롬 화면 · 빨간 ① → ② 순서로 눌러요.</figcaption><dialog ref={dialog} className="app-install-photo-dialog" aria-labelledby={label}><div className="app-install-photo-heading"><strong id={label}>크롬 설치 메뉴</strong><button type="button" className="btn small" onClick={() => dialog.current?.close()}>사진 닫기</button></div>{picture}</dialog></figure>;
}
