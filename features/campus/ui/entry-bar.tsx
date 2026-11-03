import Link from 'next/link';
import styles from './entry.module.css';
export function CampusEntryBar(){return <nav className={styles.bar} aria-label="문샷 캠퍼스 바로가기"><strong>문샷 캠퍼스</strong><span>수업을 실행하고, 동료와 함께 성장하는 공간</span><Link href="/campus/enter">작업 공간 입장 →</Link><Link href="/campus/enter?welcome=1">처음이라면 웰컴 안내</Link></nav>;}
