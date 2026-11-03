'use client';
import Link from 'next/link';
import {campusReturnPath} from './navigation';
import styles from './entry.module.css';
export function CampusEntryBar({returnTo}:{returnTo?:string}={}){const back=campusReturnPath(returnTo||null);return <nav className={styles.bar} aria-label="문샷 캠퍼스 바로가기"><strong>문샷 캠퍼스</strong><span>{back?'수업을 본 뒤, 보던 캠퍼스 화면으로 돌아갈 수 있어요.':'수업을 실행하고, 동료와 함께 성장하는 공간'}</span><Link href={back||'/campus/enter'}>{back?'← 캠퍼스로 돌아가기':'작업 공간 입장 →'}</Link><Link href="/campus/enter?welcome=1">처음이라면 웰컴 안내</Link></nav>;}
