import type { Metadata } from 'next';
import './ui/design.css';
import './ui/platform.css';
export const metadata: Metadata = {title:'BrandyAction EDU | 배운 것을, 내 일의 성과로.',description:'AI와 마케팅을 배우고 내 업무에 적용하는 실행 중심 교육.',robots: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? undefined : {index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="ko"><body>{children}</body></html>; }
