import {useId, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, CalendarDays, Download, ExternalLink, LockKeyhole, Play} from 'lucide-react';
import {youtubeVideoId} from '../webinar/resources';
import type {ArrivalConfig} from './config';
import monitor from './office-demo.module.css';
import styles from './onboarding-program.module.css';

export type OnboardingGuide = 'materials' | 'intro';
export const guideTitles = {'materials': '무료자료 · 라이브 특전', 'intro': '퇴사선배 윤익 · 브랜디액션 팀'};

const guides = [
  {id:'blueprint', title:'AI팀 설계도', description:'결제가 줄었을 때, AI 직원들이 원인을 찾고 상품 안내를 고치는 과정을 살펴보세요.', href:'https://edu.brandyaction.com/ai-team-blueprint'},
  {id:'guide', title:'작업별 AI 활용 가이드', description:'지금 맡기고 싶은 일부터 골라 AI 쓰는 방법을 확인해보세요.', href:'https://edu.brandyaction.com/guide'},
] as const;

function MaterialCover({id}: {id: 'ad' | 'guide' | 'blueprint'}) {
  /* eslint-disable-next-line @next/next/no-img-element -- Local, sized preview of the original material. */
  return <img className={styles.cover} src={`/campus/arrival/material-${id}.webp`} width={480} height={270} alt="" loading={id === 'blueprint' ? 'eager' : 'lazy'} decoding="async"/>;
}

export function OnboardingProgram({guide, config, dateLabel, materialsReady, onContentReplay, onClose, onContinue, onShowSchedule}: {
  guide: OnboardingGuide;
  config: ArrivalConfig;
  dateLabel: string;
  materialsReady: boolean;
  onContentReplay: () => void;
  onClose: () => void;
  onContinue: () => void;
  onShowSchedule?: () => void;
}) {
  const [materialsTab, setMaterialsTab] = useState<'free' | 'bonus'>('free');
  const [playGreeting, setPlayGreeting] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const greeting = youtubeVideoId(config.videoUrl);
  const isMaterials = guide === 'materials';

  function selectMaterials(tab: 'free' | 'bonus') {
    setMaterialsTab(tab);
    if (body.current) body.current.scrollTop = 0;
  }

  return <section className={monitor.monitor} aria-labelledby={titleId}>
    <header className={monitor.header}>
      <h2 id={titleId} className={styles.title} tabIndex={-1}>{isMaterials ? guideTitles.materials : '강사와 팀 소개'}</h2>
      <button type="button" className={monitor.leave} onClick={onClose}><ArrowLeft size={15} aria-hidden="true"/>라운지로 돌아가기</button>
    </header>
    {isMaterials && <div className={styles.switcher} role="group" aria-label="자료 유형">
      <button type="button" aria-pressed={materialsTab === 'free'} onClick={() => selectMaterials('free')}>무료자료</button>
      <button type="button" aria-pressed={materialsTab === 'bonus'} onClick={() => selectMaterials('bonus')}>라이브 특전</button>
    </div>}
    <div className={`${monitor.body} ${styles.body}`} ref={body}>
      {isMaterials ? <section aria-label="웰컴 라운지 안내">
        {materialsTab === 'free' ? <>
          <h3>라이브 전에 볼 자료</h3>
          <article className={styles.worksheet}>
            <h4>우리 회사 업무 기준표</h4>
            <p>AI에게 맡길 일과 결과를 판단할 기준을 적어보세요. 소개글과 문의 답변에 같은 기준을 적용해볼 수 있어요.</p>
            <a href="/campus/arrival/company-rule-worksheet.txt" download="문샷-우리-회사-업무-기준표.txt"><Download size={16} aria-hidden="true"/>회사 업무 기준표 받기</a>
            <details className={styles.worksheetExample}>
              <summary>작성 예시 보기</summary>
              <dl className={styles.sample}>
                <div><dt>오늘 AI에게 맡길 일 한 가지</dt><dd>다음 라이브를 소개하는 첫 문장과 신청 문의 답변 초안을 준비한다.</dd></div>
                <div><dt>함께 지킬 기준 한 줄</dt><dd>기능 이름보다 고객이 받아볼 결과물을 먼저 보여준다.</dd></div>
              </dl>
            </details>
          </article>
          {onShowSchedule && <div className={styles.next}>
            <p>{dateLabel} 라이브에서 이 기준을 AI 직원에게 적용하는 방법을 배워요.</p>
            <button type="button" onClick={onShowSchedule}><CalendarDays size={16} aria-hidden="true"/>일정 다시 보기</button>
          </div>}
          <div className={styles.cards}>
            {guides.map(item => <article className={styles.card} key={item.id}>
              <MaterialCover id={item.id}/>
              <div><h4>{item.title}</h4><p>{item.description}</p>
                <a href={item.href} aria-label={`${item.title} 열기 (새 탭)`} target="_blank" rel="noopener noreferrer">자료 열기 <ExternalLink size={15} aria-hidden="true"/></a></div>
            </article>)}
            <article className={styles.card}>
              <MaterialCover id="ad"/>
              <div><h4>우리 제품으로 AI 광고 영상 만들기</h4><p>고객 리뷰에서 찾은 한 가지 불편을 광고 영상으로 바꾸는 과정을 확인해보세요.</p>
                <button type="button" onClick={onContentReplay}>광고 영상 체험 열기 <ArrowRight size={15} aria-hidden="true"/></button></div>
            </article>
          </div>
          {config.handoutLabel && config.handoutUrl && <div className={styles.more}><a href={config.handoutUrl} target="_blank" rel="noopener noreferrer">{config.handoutLabel}<ExternalLink size={15} aria-hidden="true"/></a></div>}
        </> : <>
          <p className={styles.lockNote}><LockKeyhole size={17} aria-hidden="true"/>{dateLabel} 라이브에서 비밀번호를 공개합니다.</p>
          <ul className={styles.bonuses}>
            <li>내 사업에 딱 맞춘 AI 활용 리포트</li>
            <li>메타 × 클로드 세팅 가이드</li>
            <li>Garry Tan Skills 자료</li>
          </ul>
          {config.bonusPreview && <p>{config.bonusPreview}</p>}
        </>}
      </section> : <section>
        <h3>{config.instructorName}</h3>
        <p>{config.instructorIntro}</p>
        <div className={styles.teamExample}>
          <div>
            <h4 className={styles.teamTitle}>브랜디액션 팀이 AI와 일하는 모습</h4>
            <p>AI 직원에게 이름과 업무를 정해 주는 화면과 고객 응대·경쟁 분석·시장 조사를 맡은 직원의 책상을 볼 수 있어요.</p>
            <p className={styles.teamDuration}>14초 영상</p>
          </div>
          <video className={styles.teamVideo} controls playsInline preload="none" poster="/campus/showcase/ai-office-real-enhanced-v3.webp"
            aria-label="브랜디액션 팀의 AI 사무실 업무 화면" src="/campus/arrival/team-at-work.mp4"/>
        </div>
        {greeting && <section className={styles.greeting} aria-label="퇴사선배 윤익의 인사 영상">
          {playGreeting ? <iframe title="퇴사선배 윤익의 인사 영상" src={`https://www.youtube-nocookie.com/embed/${greeting}?autoplay=1`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/>
            : <button type="button" style={{backgroundImage: `url(https://i.ytimg.com/vi/${greeting}/hqdefault.jpg)`}} onClick={() => setPlayGreeting(true)}><span><Play size={22} aria-hidden="true"/>퇴사선배 윤익의 인사 영상 재생</span></button>}
        </section>}
      </section>}
    </div>
    {!isMaterials && <footer className={monitor.footer}><button type="button" className={styles.guideButton} onClick={onContinue}>{materialsReady ? '무료 자료 보기' : '라이브 일정 저장'}<ArrowRight size={16} aria-hidden="true"/></button></footer>}
  </section>;
}
