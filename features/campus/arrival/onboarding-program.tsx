import {useId, useRef, useState, type SyntheticEvent} from 'react';
import {ArrowLeft, ArrowRight, CalendarDays, ChevronDown, Download, ExternalLink, LockKeyhole, Play} from 'lucide-react';
import {youtubeVideoId} from '../webinar/resources';
import type {ArrivalConfig} from './config';
import monitor from './office-demo.module.css';
import progression from './progression.module.css';
import styles from './onboarding-program.module.css';

export type OnboardingGuide = 'materials' | 'intro';

export function onboardingGuideTitle(guide: OnboardingGuide, config: ArrivalConfig) {
  return guide === 'materials' ? '무료자료 · 라이브 특전' : config.instructorName;
}

const instructorStats = [
  {value:'13년', label:'광고 집행'},
  {value:'250억', label:'누적 광고비'},
  {value:'1,000명+', label:'누적 수강생'},
  {value:'3.6만', label:'SNS 팔로워'},
] as const;

const liveTopics = [
  'AI 마케팅 팀 만드는 법',
  '흩어진 데이터를 한 곳에 모으는 법',
  '반복 업무를 AI 직원에게 나눠 맡기는 법',
  '광고비 250억을 쓰며 쌓은 판단 기준을 AI에 적용하는 법',
] as const;

const guides = [
  {id:'blueprint', title:'AI팀 설계도', description:'결제가 줄었을 때, AI 직원들이 원인을 찾고 상품 안내를 고치는 과정을 살펴보세요.', href:'https://edu.brandyaction.com/ai-team-blueprint'},
  {id:'guide', title:'작업별 AI 활용 가이드', description:'지금 맡기고 싶은 일부터 골라 AI 쓰는 방법을 확인해보세요.', href:'https://edu.brandyaction.com/guide'},
] as const;

function toggleMeetupVideo(event: SyntheticEvent<HTMLDetailsElement>) {
  const details = event.currentTarget;
  const video = details.querySelector('video');
  if (!details.open) video?.pause();
  else if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) void video?.play().catch(() => {});
}

function MaterialCover({id}: {id: 'ad' | 'guide' | 'blueprint'}) {
  /* eslint-disable-next-line @next/next/no-img-element -- Local, sized preview of the original material. */
  return <img className={styles.cover} src={`/campus/arrival/material-${id}.webp`} width={480} height={270} alt="" loading={id === 'blueprint' ? 'eager' : 'lazy'} decoding="async"/>;
}

export function OnboardingProgram({guide, config, dateLabel, weekday, timeLabel, onContentReplay, onClose, onOpenMaterials, onOpenSchedule}: {
  guide: OnboardingGuide;
  config: ArrivalConfig;
  dateLabel: string;
  weekday: string;
  timeLabel: string;
  onContentReplay: () => void;
  onClose: () => void;
  onOpenMaterials: () => void;
  onOpenSchedule: () => void;
}) {
  const [materialsTab, setMaterialsTab] = useState<'free' | 'bonus'>('free');
  const [playGreeting, setPlayGreeting] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const greeting = youtubeVideoId(config.videoUrl);
  const isMaterials = guide === 'materials';
  const [teamLead, ...teamParagraphs] = config.teamIntro?.split(/\n\s*\n/) ?? [];

  function selectMaterials(tab: 'free' | 'bonus') {
    setMaterialsTab(tab);
    if (body.current) body.current.scrollTop = 0;
  }

  return <section className={monitor.monitor} aria-labelledby={titleId}>
    <header className={`${monitor.header} ${styles.header}`}>
      <h2 id={titleId} className={styles.title} tabIndex={-1}>{onboardingGuideTitle(guide, config)}</h2>
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
          <div className={styles.worksheet}>
            <p>AI 직원에게 맡길 일과 결과를 확인할 기준을 적어보세요.</p>
            <a href="/campus/arrival/company-rule-worksheet.txt" download="문샷-우리-회사-업무-기준표.txt"><Download size={16} aria-hidden="true"/>회사 업무 기준표 받기</a>
          </div>
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
          <p className={styles.lockNote}><LockKeyhole size={17} aria-hidden="true"/>{dateLabel} {timeLabel} 라이브에서 비밀번호를 공개합니다.</p>
          <ul className={styles.bonuses}>
            <li>내 사업에 딱 맞춘 AI 활용 리포트</li>
            <li>메타 × 클로드 세팅 가이드</li>
            <li>Garry Tan Skills 자료</li>
          </ul>
          {config.bonusPreview && <p>{config.bonusPreview}</p>}
          <button type="button" className={styles.guideButton} onClick={onOpenSchedule}><CalendarDays size={16} aria-hidden="true"/>캘린더에 추가</button>
        </>}
      </section> : <section className={styles.profile}>
        <p className={styles.role}>13년차 퍼포먼스 마케터 · 브랜디액션 CMO</p>
        <p>{config.instructorIntro}</p>
        <dl className={styles.stats}>
          {instructorStats.map(({label, value}) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        {teamLead && <section className={styles.story}>
          <h3>브랜디액션이 일하는 방식</h3>
          <p>{teamLead}</p>
          <figure className={`${styles.mediaFigure} ${styles.meetupPhoto}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Local, pre-sized photo supplied for the welcome lounge. */}
            <img src="/campus/arrival/brandyaction-meetup.webp" width={1080} height={608} alt="브랜디액션 오프라인 모임에 함께한 참가자들의 단체 사진" loading="lazy" decoding="async"/>
            <figcaption>브랜디액션 오프라인 모임</figcaption>
          </figure>
          <details className={`${styles.videoDisclosure} ${styles.meetupDisclosure}`} onToggle={toggleMeetupVideo}>
            <summary>오프라인 모임 영상 보기 <ChevronDown size={16} aria-hidden="true"/></summary>
            <video className={styles.meetupVideo} controls muted loop playsInline preload="none" poster="/campus/arrival/brandyaction-meetup-poster.webp"
              aria-label="브랜디액션 오프라인 모임과 참가자 후기 영상" src="/campus/arrival/brandyaction-meetup.mp4"/>
          </details>
          {teamParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </section>}
        <section className={styles.agenda}>
          <h3>{dateLabel} ({weekday.replace(/요일$/, '')}) {timeLabel} 무료 라이브에서 알려드려요</h3>
          <ul>{liveTopics.map(topic => <li key={topic}>{topic}</li>)}</ul>
        </section>
        <figure className={styles.mediaFigure}>
          <h3>브랜디액션 팀의 실제 AI 사무실</h3>
          {/* eslint-disable-next-line @next/next/no-img-element -- Local, pre-sized WebP used in the campus showcase. */}
          <img src="/campus/showcase/ai-office-real-enhanced-v3.webp" width={1473} height={1068} alt="AI 직원들이 각자 맡은 일을 하는 브랜디액션의 3D 사무실 화면" loading="lazy" decoding="async"/>
          <figcaption>직원마다 맡은 일이 있어요. 사람은 확인하고 승인만 해요.</figcaption>
        </figure>
        <details className={styles.videoDisclosure}>
          <summary>AI 사무실 영상 보기 <ChevronDown size={16} aria-hidden="true"/></summary>
          <video className={styles.teamVideo} controls playsInline preload="none" poster="/campus/showcase/ai-office-real-enhanced-v3.webp"
            aria-label="브랜디액션 팀의 AI 사무실 업무 화면" src="/campus/arrival/team-at-work.mp4"/>
        </details>
        {greeting && <section className={styles.greeting} aria-label="퇴사선배 윤익의 인사 영상">
          {playGreeting ? <iframe title="퇴사선배 윤익의 인사 영상" src={`https://www.youtube-nocookie.com/embed/${greeting}?autoplay=1`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/>
            : <button type="button" style={{backgroundImage: `url(https://i.ytimg.com/vi/${greeting}/hqdefault.jpg)`}} onClick={() => setPlayGreeting(true)}><span><Play size={22} aria-hidden="true"/>퇴사선배 윤익의 인사 영상 재생</span></button>}
        </section>}
      </section>}
    </div>
    {!isMaterials && <footer className={monitor.footer}><button type="button" className={progression.nextAction} onClick={onOpenMaterials}>무료자료 확인하러 가기 <ArrowRight size={16} aria-hidden="true"/></button></footer>}
  </section>;
}
