'use client';
/* eslint-disable @next/next/no-img-element -- Same-origin installation screenshots; preserve their original proportions. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Compass, Copy, Home, MoreHorizontal, MoreVertical, Share, Smartphone } from 'lucide-react';
import type { InstallDevice } from '@/lib/app-install';

type Photo = { src: string; width: number; height: number; caption: string; alt: string };
type Step = { title: string; action: ReactNode; help?: ReactNode; photo?: Photo; icon: ReactNode };
const menuPhoto: Photo = { src: '/installation-guide/chrome-menu.webp', width: 1100, height: 699, caption: 'Chrome에서 ‘페이지를 앱으로 설치’ 찾기', alt: '실제 컴퓨터 Chrome 메뉴. 캐스팅, 저장, 공유 하위 메뉴의 페이지를 앱으로 설치 항목' };
const confirmPhoto: Photo = { src: '/installation-guide/chrome-confirm.webp', width: 905, height: 700, caption: 'Chrome 설치 창에서 사이트 확인하기', alt: '실제 컴퓨터 Chrome 설치 창. 사이트 이름과 주소 아래에 취소와 다음 버튼' };

export function AppInstallGuide({ device, homeUrl }: { device: InstallDevice; homeUrl: string }) {
  const [selected, setSelected] = useState(device), [browser, setBrowser] = useState('chrome'), [index, setIndex] = useState(0), [copied, setCopied] = useState('');
  const heading = useRef<HTMLHeadingElement>(null), moveFocus = useRef(false), stepId = useId();
  useEffect(() => { if (moveFocus.current) { heading.current?.focus(); moveFocus.current = false; } }, [index, selected, browser]);
  function changeStep(next: number) { moveFocus.current = true; setIndex(next); }
  function choose(value: InstallDevice) { moveFocus.current = true; setSelected(value); setIndex(0); setCopied(''); }
  async function copy() {
    try { await navigator.clipboard.writeText(homeUrl); setCopied('주소를 복사했어요. 인터넷 앱의 주소 칸을 길게 눌러 붙여넣으세요.'); }
    catch { setCopied('자동 복사가 안 됐어요. 아래 주소를 길게 누르거나 선택해서 직접 복사하세요.'); }
  }
  const address = <div className="app-install-address"><label>열어야 할 사이트<input aria-label="안내할 사이트 주소" readOnly value={homeUrl}/></label><button type="button" className="btn small" onClick={() => void copy()}><Copy size={16} aria-hidden="true"/>주소 복사</button>{copied && <p role="status">{copied}</p>}</div>;
  const steps: Step[] = selected === 'ios' ? [
    { title: '사파리로 브랜디에듀를 열어요', icon: <Compass/>, action: <>아이폰에서 <strong>Safari(사파리)</strong> 앱을 누르세요. 파란 나침반 모양이에요. 주소 칸에 아래 주소를 붙여넣고 이동하세요.{address}</>, help: <>카카오톡·텔레그램 안에서 보고 있다면 먼저 이 주소를 복사하세요. 그다음 휴대폰 첫 화면으로 나가 사파리를 여세요.</> },
    { title: '공유 버튼을 눌러요', icon: <Share/>, action: <>사파리에서 <strong>공유 <Share size={20} className="app-install-inline-icon" aria-hidden="true"/></strong> 버튼을 누르세요. 네모 위로 화살표가 올라가는 작은 버튼이에요.</>, help: <>공유 버튼이 안 보이나요? 주소 칸 옆의 <strong>메뉴(…)</strong>를 먼저 눌러 ‘공유’를 찾으세요.</> },
    { title: '‘홈 화면에 추가’를 눌러요', icon: <Home/>, action: <>공유 메뉴를 <strong>아래로 내려</strong> ‘홈 화면에 추가’를 누르세요.</>, help: <>목록에 없나요? 맨 아래 ‘동작 편집’을 누르고 ‘홈 화면에 추가’를 찾으세요.</> },
    { title: '오른쪽 위 ‘추가’를 눌러요', icon: <Smartphone/>, action: <>이름이 ‘브랜디에듀’인지 확인하고 <strong>‘추가’</strong>를 누르세요.</>, help: <>‘웹 앱으로 열기’ 스위치가 보이면 켜 둔 채로 추가하세요.</> },
  ] : selected === 'android' ? [
    { title: '크롬으로 브랜디에듀를 열어요', icon: <Compass/>, action: <>휴대폰에서 <strong>Chrome(크롬)</strong> 앱을 누르세요. 빨강·노랑·초록색 동그라미 모양이에요. 주소 칸에 아래 주소를 붙여넣고 이동하세요.{address}</>, help: <>카카오톡·텔레그램 안에서 보고 있다면 먼저 이 주소를 복사하세요. 그다음 휴대폰 첫 화면으로 나가 크롬을 여세요.</> },
    { title: '오른쪽 위 점 3개를 눌러요', icon: <MoreVertical/>, action: <>크롬의 주소 칸 오른쪽에 있는 <strong>점 3개(⋮)</strong> 버튼을 누르세요.</> },
    { title: '‘설치’ 메뉴를 눌러요', icon: <Home/>, action: <><strong>‘설치 및 바로가기 만들기’ → ‘설치’</strong>를 누르세요.</>, help: <>휴대폰에 따라 ‘홈 화면에 추가’ 또는 ‘앱 설치’라고 나올 수 있어요. 같은 기능이에요.</> },
    { title: '작은 창에서 ‘설치’를 눌러요', icon: <Smartphone/>, action: <>이름이 ‘브랜디에듀’인지 확인하고 <strong>‘설치’ 또는 ‘추가’</strong>를 누르세요.</>, help: <>한 번 더 물어보면 ‘추가’를 누르세요. 앱스토어로 이동할 필요는 없어요.</> },
  ] : browser === 'safari' ? [
    { title: '사파리로 브랜디에듀를 열어요', icon: <Compass/>, action: <>Mac의 Safari(사파리)를 열고 아래 주소로 이동하세요.{address}</> },
    { title: '화면 맨 위 ‘파일’을 눌러요', icon: <MoreHorizontal/>, action: <>화면 맨 위 메뉴 줄에서 <strong>‘파일’</strong>을 누르세요.</> },
    { title: '‘Dock에 추가’를 눌러요', icon: <Home/>, action: <><strong>‘Dock에 추가’</strong>를 누르세요. Dock은 앱 아이콘이 모여 있는 줄이에요.</> },
    { title: '‘추가’를 눌러요', icon: <Smartphone/>, action: <>사이트 이름을 확인하고 <strong>‘추가’</strong>를 누르세요.</> },
  ] : [
    { title: `${browser === 'edge' ? '엣지' : '크롬'}로 브랜디에듀를 열어요`, icon: <Compass/>, action: <>컴퓨터에서 {browser === 'edge' ? 'Edge(엣지)' : 'Chrome(크롬)'}를 열고 아래 주소로 이동하세요.{address}</> },
    { title: '오른쪽 위 점 3개를 눌러요', icon: browser === 'edge' ? <MoreHorizontal/> : <MoreVertical/>, action: <>주소 칸 오른쪽 끝의 <strong>점 3개({browser === 'edge' ? '…' : '⋮'})</strong>를 누르세요.</> },
    { title: '‘앱으로 설치’를 눌러요', icon: <Home/>, action: browser === 'edge' ? <><strong>‘앱’ → ‘이 사이트를 앱으로 설치’</strong>를 누르세요. ‘앱’이 없으면 ‘추가 도구’ 안에서 찾으세요.</> : <><strong>‘캐스팅, 저장, 공유’ → ‘페이지를 앱으로 설치’</strong>를 누르세요. ‘전송, 저장 및 공유’라고 보일 수도 있어요.</>, photo: browser === 'chrome' ? menuPhoto : undefined },
    { title: '사이트 이름을 확인하고 ‘다음’을 눌러요', icon: <Smartphone/>, action: <>‘브랜디에듀’인지 확인하고 <strong>‘다음’ 또는 ‘설치’</strong>를 누르세요. 추가 안내가 나오면 따라 진행하세요.</>, photo: browser === 'chrome' ? confirmPhoto : undefined },
  ];
  const step = steps[index], finished = index === steps.length;
  return <div className="app-install-guide mt16">
    <p className="app-install-picker-label">어떤 기기에 추가할까요?</p>
    <div className="app-install-devices" role="group" aria-label="앱을 추가할 기기">{([['ios', '아이폰·아이패드'], ['android', '갤럭시·안드로이드'], ['desktop', '컴퓨터']] as const).map(([value, label]) => <button key={value} type="button" className="btn small" aria-pressed={selected === value} onClick={() => choose(value)}>{label}</button>)}</div>
    {selected === 'desktop' && <label className="app-install-browser mt16">사용할 인터넷 앱<select value={browser} onChange={event => { moveFocus.current = true; setBrowser(event.target.value); setIndex(0); }}><option value="chrome">크롬(Chrome)</option><option value="edge">엣지(Edge)</option><option value="safari">맥 사파리(Safari)</option></select></label>}
    <div className="app-install-step" aria-labelledby={stepId}>
      <div className="app-install-progress" aria-label={finished ? '아이콘 찾기' : `총 ${steps.length}단계 중 ${index + 1}단계`}>{steps.map((_, i) => <span key={i} className={i <= index ? 'active' : ''} aria-hidden="true"/>)}<span>{finished ? '이제 아이콘을 찾아보세요' : `${index + 1} / ${steps.length}`}</span></div>
      <div className="app-install-step-heading"><span className="app-install-step-icon" aria-hidden="true">{finished ? <Home/> : step.icon}</span><h3 id={stepId} ref={heading} tabIndex={-1}>{finished ? selected === 'desktop' ? '컴퓨터에서 아이콘을 찾아보세요' : '휴대폰 첫 화면으로 나가 보세요' : step.title}</h3></div>
      {finished ? <><p>{selected === 'desktop' ? '컴퓨터의 앱 목록이나 Dock에서' : '휴대폰 첫 화면에서'} <strong>‘브랜디에듀’ 아이콘</strong>을 찾아 누르세요. 내 강의는 ‘내 클래스’에서 볼 수 있어요.</p><p className="app-install-step-help">{selected === 'android' ? '아이콘이 안 보이면 첫 화면을 아래에서 위로 쓸어 앱 목록에서도 찾아보세요.' : selected === 'ios' ? '아이콘이 안 보이면 첫 화면을 옆으로 넘겨 보세요. 맨 마지막 화면의 앱 보관함에서도 찾을 수 있어요.' : '설치 창이 아직 열려 있다면 먼저 그 창의 안내를 끝내세요.'}</p><button type="button" className="btn small" onClick={() => changeStep(0)}>처음부터 다시 보기</button></> : <><div className="app-install-step-action">{step.action}</div>{step.photo && <InstallScreenshot key={step.photo.src} photo={step.photo}/>} {step.help && <p className="app-install-step-help">{step.help}</p>}<div className="app-install-step-nav"><button type="button" className="btn" disabled={index === 0} onClick={() => changeStep(index - 1)}><ArrowLeft size={16} aria-hidden="true"/>이전</button><button type="button" className="btn primary" onClick={() => changeStep(index + 1)}>{index === steps.length - 1 ? '아이콘 찾는 법 보기' : '다음 단계'}<ArrowRight size={16} aria-hidden="true"/></button></div></>}
    </div>
    <div className="app-install-faq" aria-label="자주 묻는 질문"><details><summary>앱스토어에서 검색해도 안 나와요</summary><p>앱스토어·플레이스토어에서 다운로드하는 앱이 아니에요. 위 순서대로 사이트 아이콘만 만들면 돼요. 따로 결제할 필요가 없어요.</p></details><details><summary>새로 가입하거나 결제해야 하나요?</summary><p>아니요. 로그인 화면이 나오면 <strong>수강 신청할 때 쓴 계정</strong>으로 로그인하세요. 카카오로 신청했다면 ‘카카오로 계속하기’를 누르세요. 로그인 이메일을 변경했다면 바꾼 이메일과 브랜디에듀 비밀번호를 쓰세요. 기존 강의와 학습 기록은 그대로예요.</p></details><details><summary>메뉴를 못 찾겠어요. 꼭 추가해야 하나요?</summary><p>꼭 추가하지 않아도 돼요. 지금처럼 사이트에서 강의를 볼 수 있어요. 메뉴가 안 보이면 사파리(아이폰)나 크롬(갤럭시)으로 열었는지 먼저 확인하세요. 메뉴 이름과 위치는 기기·버전에 따라 달라요.</p></details><details><summary>아이콘을 추가하면 인터넷 없이도 볼 수 있나요?</summary><p>강의와 자료를 보려면 인터넷 연결이 필요해요. 아이콘은 브랜디에듀를 쉽게 여는 바로가기예요.</p></details></div>
  </div>;
}

function InstallScreenshot({ photo }: { photo: Photo }) {
  const dialog = useRef<HTMLDialogElement>(null), label = useId();
  return <figure className="app-install-shot"><button type="button" className="app-install-shot-button" aria-label={`${photo.caption} 크게 보기`} onClick={() => dialog.current?.showModal()}><img src={photo.src} width={photo.width} height={photo.height} alt={photo.alt} loading="lazy" decoding="async"/><span aria-hidden="true">사진 크게 보기 ↗</span></button><figcaption>{photo.caption} · 실제 Mac Chrome 화면</figcaption><dialog ref={dialog} className="app-install-photo-dialog" aria-labelledby={label}><div className="app-install-photo-heading"><strong id={label}>{photo.caption}</strong><button type="button" className="btn small" onClick={() => dialog.current?.close()}>사진 닫기</button></div><img src={photo.src} width={photo.width} height={photo.height} alt={photo.alt}/></dialog></figure>;
}
