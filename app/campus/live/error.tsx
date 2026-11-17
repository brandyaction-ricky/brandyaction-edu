'use client';
import Link from 'next/link';
export default function ErrorPage({reset}:{reset:()=>void}){return <main style={{padding:'80px 24px',maxWidth:720,margin:'auto'}}><h1>잠시 연결이 원활하지 않아요.</h1><p>라이브 입장 정보를 다시 불러와 주세요.</p><button onClick={reset}>다시 시도</button><p><Link href="/classes">문샷 클래스 둘러보기</Link></p></main>;}
