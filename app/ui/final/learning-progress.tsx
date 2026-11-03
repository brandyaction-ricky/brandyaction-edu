import './learning-progress.css';
export function LearningProgress({ complete, total, label = '학습 진행률' }: { complete: number; total: number; label?: string }) {
  const count = Math.min(Math.max(0, complete), total), percent = total ? Math.round(count / total * 100) : 0;
  return <section className="learning-progress-summary" aria-label={label}><div><strong>{label}</strong><span>{count} / {total}개 완료 <b>{percent}%</b></span></div><div className="learning-progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${total}개 중 ${count}개 완료`}><span style={{ width: `${percent}%` }}/></div></section>;
}
