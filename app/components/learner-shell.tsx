import Link from "next/link";
import { BookOpen, CreditCard, Download, HelpCircle, Home, LogOut, MessageSquareText, Settings, Star, Target, TicketPercent } from "lucide-react";
import { getPublicSupport } from "@/lib/education-data";

const items = [
  { id:"home", label:"마이페이지", href:"/my", icon:Home },
  { id:"classes", label:"내 클래스", href:"/my/cohort", icon:BookOpen },
  { id:"missions", label:"내 미션", href:"/my/missions", icon:Target },
  { id:"questions", label:"학습 문의", href:"/my/questions", icon:MessageSquareText },
  { id:"resources", label:"내 자료실", href:"/my/resources", icon:Download },
  { id:"reviews", label:"내 상품 후기", href:"/my/reviews", icon:Star },
  { id:"orders", label:"신청·주문 내역", href:"/my/orders", icon:CreditCard },
  { id:"coupons", label:"내 쿠폰", href:"/my/coupons", icon:TicketPercent },
  { id:"settings", label:"회원 정보", href:"/my/settings", icon:Settings },
];

export async function LearnerShell({ active, children, userName = "회원" }: { active: string; children: React.ReactNode; userName?: string }) {
  const { supportEmail } = await getPublicSupport();
  return <div className="learner-app">
    <header className="ba-learning-header"><div className="container"><Link href="/my" className="ba-wordmark" aria-label="BrandyAction EDU 나의 학습"><b>b</b>brandyaction <small>EDU</small></Link><div className="ba-learning-context"><b>나의 학습</b><span>배움을 실행으로 이어가는 공간</span></div><Link className="ba-button" href="/my/cohort">내 클래스</Link></div></header>
    <div className="container ba-account-layout"><aside className="learner-sidebar">
      <div className="ba-account-profile"><span>{userName[0] || "회"}</span><div><strong>{userName}</strong><p>실행을 쌓아가는 중</p></div></div>
      <nav aria-label="나의 학습 메뉴">{items.map(({id,label,href,icon:Icon})=><Link key={id} href={href} className={active===id?"active":""} aria-current={active===id?"page":undefined}><Icon aria-hidden="true"/>{label}</Link>)}</nav><div className="sidebar-bottom"><a href={`mailto:${supportEmail}`}><HelpCircle/>도움말</a><form action="/auth/signout" method="post"><button type="submit"><LogOut/>로그아웃</button></form></div>
    </aside><div className="learner-content">{children}</div></div>
    <footer className="ba-learning-footer"><div className="container"><span>BRANDYACTION EDU · 나의 배움과 실행</span><div><a href={`mailto:${supportEmail}`}>이용 문의</a> · <Link href="/">홈으로</Link></div></div></footer>
  </div>;
}
