import Link from "next/link";
import { BookOpen, CreditCard, HelpCircle, Home, LogOut, Settings } from "lucide-react";
import { getPublicSupport } from "@/lib/education-data";

const items = [
  { id:"home", label:"홈", href:"/my", icon:Home },
  { id:"classes", label:"내 클래스", href:"/my/cohort", icon:BookOpen },
  { id:"orders", label:"구매 내역", href:"/my/orders", icon:CreditCard },
  { id:"settings", label:"계정 설정", href:"/my/settings", icon:Settings },
];

export async function LearnerShell({ active, children, userName = "회원" }: { active: string; children: React.ReactNode; userName?: string }) {
  const { supportEmail } = await getPublicSupport();
  return <div className="learner-app">
    <aside className="learner-sidebar"><Link href="/" className="app-logo">BRANDYACTION <span>EDU</span></Link><nav>{items.map(({id,label,href,icon:Icon})=><Link key={id} href={href} className={active===id?"active":""}><Icon/>{label}</Link>)}</nav><div className="sidebar-bottom"><a href={`mailto:${supportEmail}`}><HelpCircle/>도움말</a><form action="/auth/signout" method="post"><button type="submit"><LogOut/>로그아웃</button></form></div></aside>
    <div className="learner-body"><header className="app-topbar"><div><strong>학습공간</strong><span>내 클래스와 일정을 한곳에서 확인하세요.</span></div><div><span className="user-avatar">{userName[0] || "회"}</span><strong>{userName}</strong></div></header><div className="learner-content">{children}</div></div>
  </div>;
}
