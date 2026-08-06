import Link from "next/link";
import { ArrowRight, CalendarDays, Check } from "lucide-react";
import { BrandHeader } from "../components/brand-header";

export default function OrderComplete(){return <main><BrandHeader/><section className="complete-screen"><div className="complete-check"><Check/></div><span>신청이 완료되었습니다</span><h1>이제 실행할 준비를<br/>시작해 볼까요?</h1><p>매출을 만드는 자영업 마케팅 실전반 1기가<br/>내 클래스에 자동으로 등록되었습니다.</p><div className="complete-card"><div><CalendarDays/><span>첫 라이브</span><strong>8월 19일 수요일 · 20:00</strong></div><div><span>수강번호</span><strong>BAE-202608-0124</strong></div></div><Link className="button button-primary button-lg" href="/my/cohort">기수 홈으로 이동 <ArrowRight/></Link><Link className="simple-link" href="/">메인으로 돌아가기</Link></section></main>}
