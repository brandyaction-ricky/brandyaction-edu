import Link from "next/link";
import { BookOpen, ChevronDown, Code2, CreditCard, FileImage, FileText, GraduationCap, LayoutDashboard, LogOut, Megaphone, MessageSquareText, MessagesSquare, Route, Settings, ShieldCheck, Tags, TicketPercent, Users } from "lucide-react";
import { getAdminSession } from "@/lib/server-auth";

const navGroups = [
  { label:"운영 현황",items:[{ id:"dashboard",label:"대시보드",href:"/admin",icon:LayoutDashboard },{ id:"journey",label:"행동·전환 분석",href:"/admin/journey",icon:Route }] },
  { label:"교육 운영",items:[{ id:"products",label:"상품 관리",href:"/admin/products",icon:BookOpen },{ id:"cohorts",label:"기수·회차 관리",href:"/admin/cohorts",icon:GraduationCap },{ id:"reviews",label:"후기 관리",href:"/admin/reviews",icon:MessageSquareText }] },
  { label:"고객·매출",items:[{ id:"members",label:"회원 관리",href:"/admin/members",icon:Users },{ id:"member-tags",label:"고객 태그 관리",href:"/admin/member-tags",icon:Tags },{ id:"orders",label:"주문·결제",href:"/admin/orders",icon:CreditCard },{ id:"coupons",label:"쿠폰 관리",href:"/admin/coupons",icon:TicketPercent }] },
  { label:"콘텐츠 관리",items:[{ id:"banners",label:"배너 관리",href:"/admin/banners",icon:FileImage },{ id:"articles",label:"블로그 관리",href:"/admin/articles",icon:FileText }] },
  { label:"마케팅 관리",items:[{ id:"code-settings",label:"검색·코드 설정",href:"/admin/code-settings",icon:Code2 },{ id:"message-templates",label:"메시지 템플릿",href:"/admin/message-templates",icon:MessagesSquare },{ id:"crm",label:"마케팅 CRM",href:"/admin/crm",icon:Megaphone }] },
  { label:"시스템 관리",items:[{ id:"super-admins",label:"최고 관리자",href:"/admin/super-admins",icon:ShieldCheck },{ id:"settings",label:"사이트 설정",href:"/admin/settings",icon:Settings }] },
];

export async function AdminShell({active,children}:{active:string;children:React.ReactNode}){
  const operator=await getAdminSession();
  const isAdmin=operator?.role==="admin";
  const preferences=operator?.preferences||{};
  const canSee=(id:string)=>id==="dashboard"||id==="journey"||isAdmin||(id==="super-admins"||id==="code-settings"||id==="message-templates"||id==="crm"||id==="member-tags"||id==="coupons"||id==="settings"||id==="banners"?false:id==="orders"?preferences.staffCanManageOrders===true:id==="members"?preferences.staffCanManageMembers===true:preferences.staffCanManageProducts===true);
  const name=operator?.fullName||operator?.email?.split("@")[0]||"운영자";
  return <div className="admin-app"><a className="admin-skip-link" href="#admin-main">본문으로 바로가기</a><aside className="admin-sidebar"><div className="site-switcher"><span className="site-symbol">B</span><div><strong>브랜디액션 에듀</strong><small>운영 중</small></div><ChevronDown aria-hidden="true"/></div><nav aria-label="관리자 메뉴">{navGroups.map((group)=>{const items=group.items.filter((item)=>canSee(item.id));return items.length?<section className="admin-nav-group" key={group.label}><span>{group.label}</span>{items.map(({id,label,href,icon:Icon})=><Link key={id} href={href} className={id===active?"active":""} aria-current={id===active?"page":undefined}><Icon aria-hidden="true"/>{label}</Link>)}</section>:null})}</nav><Link className="view-site" href="/"><LogOut aria-hidden="true"/>고객 사이트 보기</Link></aside><div className="admin-body"><header className="admin-topbar"><div><span>운영센터</span><strong>브랜디액션 에듀</strong></div><div><span className="user-avatar">{name[0]}</span><div><strong>{name}</strong><small>{isAdmin?"최고 관리자":"스태프"}</small></div></div></header><main className="admin-content" id="admin-main" tabIndex={-1}>{children}</main></div></div>
}

export function AdminPageTitle({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:React.ReactNode}){return <div className="admin-page-title"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>}
