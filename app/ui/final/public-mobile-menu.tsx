'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MobileRefresh } from './mobile-refresh';
import styles from './public-mobile-menu.module.css';

export function PublicMobileMenu({ links, signedIn, onLogout }: {
  links: string[][]; signedIn: boolean; onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    const outside = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', keydown); document.removeEventListener('pointerdown', outside); };
  }, [open]);
  return <div className={styles.mobile} ref={wrap}>
    <Link className={styles.quick} href={signedIn ? '/my' : '/login'}>{signedIn ? '내 학습' : '로그인'}</Link>
    <button ref={trigger} type="button" className={styles.trigger} aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
      aria-controls="public-mobile-navigation" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      {open ? <X aria-hidden="true"/> : <Menu aria-hidden="true"/>}
    </button>
    {open && <nav id="public-mobile-navigation" className={styles.panel} aria-label="모바일 메뉴" onClick={event => {
      if ((event.target as HTMLElement).closest('a')) setOpen(false);
    }}>
      <div className={styles.group}>
        <span className={styles.label}>배움 둘러보기</span>
        {links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
      </div>
      <div className={styles.group}>
        <span className={styles.label}>나의 학습 · 계정</span>
        {signedIn ? <>
          <Link href="/my">마이페이지</Link>
          <Link href="/my/classes">내 클래스</Link>
          <Link href="/my/questions">질문·답변</Link>
          <Link href="/my/profile">내 정보 수정</Link>
          <Link href="/my/coupons">내 쿠폰함</Link>
          <Link href="/my/orders">신청·결제 내역</Link>
        </> : <Link href="/login">로그인·회원가입</Link>}
      </div>
      <div className={styles.utilities}>
        <MobileRefresh />
        {signedIn && <button type="button" onClick={() => { setOpen(false); onLogout(); }}>로그아웃</button>}
      </div>
    </nav>}
  </div>;
}
