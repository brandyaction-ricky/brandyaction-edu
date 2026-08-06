import Link from "next/link";
import { BookOpen, ChevronDown, CreditCard, GraduationCap, LayoutDashboard, LogOut, MessageSquareText, Settings, Users } from "lucide-react";

const nav = [
  { id:"dashboard",label:"대시보드",href:"/admin",icon:LayoutDashboard },
  { id:"products",label:"상품 관리",href:"/admin/products",icon:BookOpen },
  { id:"cohorts",label:"기수·회차 관리",href:"/admin/cohorts",icon:GraduationCap },
  { id:"members",label:"회원 관리",href:"/admin/members",icon:Users },
  { id:"orders",label:"주문·결제",href:"/admin/orders",icon:CreditCard },
  { id:"reviews",label:"리뷰 관리",href:"/admin/reviews",icon:MessageSquareText },
  { id:"settings",label:"사이트 설정",href:"/admin/settings",icon:Settings },
];

export function AdminShell({active,children}:{active:string;children:React.ReactNode}){return <div className="admin-app"><aside className="admin-sidebar"><Link href="/" className="admin-logo">BA<span>EDU</span><small>ADMIN</small></Link><div className="site-switcher"><span className="site-symbol">B</span><div><strong>브랜디액션 에듀</strong><small>운영 중</small></div><ChevronDown/></div><nav>{nav.map(({id,label,href,icon:Icon})=><Link key={id} href={href} className={id===active?"active":""}><Icon/>{label}</Link>)}</nav><Link className="view-site" href="/"><LogOut/>고객 사이트 보기</Link></aside><div className="admin-body"><header className="admin-topbar"><div><span>운영센터</span><strong>브랜디액션 에듀</strong></div><div><span className="user-avatar">리</span><div><strong>리키</strong><small>최고 관리자</small></div><ChevronDown/></div></header><div className="admin-content">{children}</div></div></div>}

export function AdminPageTitle({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:React.ReactNode}){return <div className="admin-page-title"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>}
