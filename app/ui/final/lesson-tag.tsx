import './lesson-tag.css';
export function LessonTag({ label }: { label?: string }) {
  return label?.trim() ? <span className="lesson-tag" aria-label={`학습 태그: ${label}`}>{label}</span> : null;
}
