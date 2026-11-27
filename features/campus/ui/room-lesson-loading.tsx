import styles from './lesson-task-panel.module.css';

export function RoomLessonLoading() {
  return <div className={styles.loadingLines} role="status" aria-label="수업 본문 불러오는 중">
    <span aria-hidden="true"/><span aria-hidden="true"/>
  </div>;
}
