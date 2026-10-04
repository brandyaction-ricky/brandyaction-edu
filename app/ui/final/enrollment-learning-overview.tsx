"use client";
import Link from 'next/link';
import { ArrowRight, Check, Lock } from 'lucide-react';
import { learningOverview, type LearningGroup, type LearningItem } from '@/lib/learning-overview';
import type { Row } from '@/lib/platform';
import './enrollment-learning-overview.css';

function Progress({ completed, total, label }: { completed: number; total: number; label: string }) {
  const percent = total ? Math.round(completed / total * 100) : 0;
  return <div className="elo-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: percent + '%' }}/></div>;
}
function LessonRow({ item, enrollmentId, ongoing }: { item: LearningItem; enrollmentId: string; ongoing: boolean }) {
  const content = <><span className="elo-day">{ongoing ? '반복' : `DAY ${item.day}`}</span><span className="elo-title">{item.title}</span><span className="elo-state">{item.done ? <><Check size={16}/>완료</> : item.unlocked ? '학습 가능' : <><Lock size={16}/>잠김</>}</span></>;
  return <li>{item.unlocked ? <Link href={`/learn/${enrollmentId}/${item.id}`}>{content}</Link> : <div className="elo-locked">{content}{item.reason && <small>{item.reason}</small>}</div>}</li>;
}
function Track({ group, enrollmentId, compact }: { group: LearningGroup; enrollmentId: string; compact: boolean }) {
  const ongoing = group.key === 'ongoing', target = group.next || group.review;
  const complete = !ongoing && group.completed === group.items.length;
  const waiting = !complete && !group.next;
  const weeks = [...new Set(group.items.map(item => item.week))];
  const label = ongoing ? '챌린지 보기' : group.next ? '이어서 학습하기' : '복습하기';
  return <section className="elo-track" aria-label={group.title}>
    <div className="elo-heading"><h3>{group.title}</h3>{!ongoing && <span>{Math.round(group.completed / group.items.length * 100)}%</span>}</div>
    {ongoing ? <p className="meta">기간마다 다시 참여하는 챌린지입니다.</p> : <>
      <p className="meta">현재 공개된 학습 {group.completed} / {group.items.length}개 완료</p>
      <Progress completed={group.completed} total={group.items.length} label={`${group.title} 현재 공개된 학습 진도`}/>
    </>}
    <p className="elo-current">{complete ? '현재 공개된 학습을 완료했습니다.' : waiting ? '다음 학습 공개 대기' : ongoing ? target?.title : `현재 DAY ${target?.day} · ${target?.title}`}</p>
    {waiting && <p className="meta">{group.items.find(item => !item.done)?.reason || '운영자의 학습 공개를 기다려 주세요.'}</p>}
    {target && <Link className="btn primary" href={`/learn/${enrollmentId}/${target.id}`} aria-label={`${group.title} ${label}`}>{label}<ArrowRight size={16}/></Link>}
    {!compact && <details className="elo-weeks"><summary>{ongoing ? '챌린지 목록 보기' : '주차별 학습 보기'}</summary>
      {weeks.map(week => {
        const items = group.items.filter(item => item.week === week), done = items.filter(item => item.done).length;
        return <div className="elo-week" key={week}>
          {!ongoing && <><div className="elo-heading"><h4>{week === 0 ? '온보딩' : `${week}주차`}</h4><span>{done} / {items.length}개 완료</span></div><Progress completed={done} total={items.length} label={`${group.title} ${week}주차 진도`}/></>}
          <ul>{items.map(item => <LessonRow key={item.id} item={item} enrollmentId={enrollmentId} ongoing={ongoing}/>)}</ul>
        </div>;
      })}
    </details>}
  </section>;
}
export function EnrollmentLearningOverview({ data, enrollment, compact = false }: { data: Record<string, Row[]>; enrollment: Row; compact?: boolean }) {
  const overview = learningOverview(data, enrollment);
  if (overview.status === 'inactive') return <p>수강 기간이 끝났거나 수강 권한이 없습니다.</p>;
  if (overview.status === 'error') return <div className="elo-error"><p role="alert">학습 진행 상태를 확인하지 못했습니다. 수업을 다시 불러와 주세요.</p><button className="btn small" onClick={() => window.location.reload()}>학습 상태 다시 불러오기</button></div>;
  if (!overview.groups.length) return <p>공개된 학습을 준비하고 있습니다.</p>;
  return <div className={'enrollment-learning-overview' + (compact ? ' elo-compact' : '')}>{overview.groups.map(group => <Track key={group.key} group={group} enrollmentId={enrollment.id} compact={compact}/>)}</div>;
}
