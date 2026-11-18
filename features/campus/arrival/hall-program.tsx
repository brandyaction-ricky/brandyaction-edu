import {Download, ExternalLink} from 'lucide-react';
import type {ArrivalConfig} from './config';
import {youtubeVideoId} from '../webinar/resources';
import styles from './hall-program.module.css';

export function HallProgram({config}: {config: ArrivalConfig}) {
  const greeting = youtubeVideoId(config.videoUrl);
  return <section className={styles.program} aria-label="라이브 홀 안내">
    <section><h3>{config.instructorName}</h3><p>{config.instructorIntro}</p>
      {greeting ? <details><summary>윤익님의 인사 영상 보기</summary>
        <iframe title="윤익님의 라이브 인사" src={'https://www.youtube-nocookie.com/embed/' + greeting} loading="lazy" allowFullScreen/>
        <a href={config.videoUrl} target="_blank" rel="noreferrer">유튜브에서 보기 <ExternalLink size={15}/></a>
      </details> : <p className={styles.pending}>윤익님의 인사 영상은 이곳에 공개할 예정입니다.</p>}
      <details><summary>팀이 AI 사무실에서 일하는 모습</summary>
        <video controls playsInline preload="none" poster="/campus/showcase/ai-office-real-enhanced-v3.webp" aria-label="브랜디액션 팀의 AI 사무실 업무 화면" src="/campus/arrival/team-at-work.mp4"/>
        <p>브랜디액션의 모집 영상에서 발췌한 사무실 업무 화면입니다.</p>
      </details>
    </section>
    <section><h3>가져갈 무료 자료</h3><p>오늘 고른 기준을 내 업무에 쓸 때 채워보세요.</p>
      <div><a href="/campus/arrival/company-rule-worksheet.txt" download="문샷-우리-회사-업무-기준표.txt"><Download size={16} aria-hidden="true"/> 회사 업무 기준표 받기</a></div>
      {config.handoutLabel && config.handoutUrl && <div><a href={config.handoutUrl} target="_blank" rel="noopener noreferrer">{config.handoutLabel}<ExternalLink size={15} aria-hidden="true"/></a></div>}
    </section>
    <section><h3>강의 후 공개 특전</h3>
      {config.bonusPreview ? <details><summary>특전 미리보기</summary><p>{config.bonusPreview}</p></details> :
        <details><summary>특전 구성 예시 미리보기</summary>
          <p>두 직원에게 건넬 기준표에는 어떤 내용이 들어갈까요?</p>
          <ol><li>두 직원이 함께 읽을 자료</li><li>승인한 표현과 고친 이유</li><li>다음 업무에서 확인할 항목</li></ol>
          <p className={styles.pending}>체험용 구성 예시입니다. 실제 제공 자료는 강의 공지에서 안내합니다.</p>
        </details>}
    </section>
  </section>;
}
