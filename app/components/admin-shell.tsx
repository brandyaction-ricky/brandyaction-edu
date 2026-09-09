import Link from "next/link";
import { BookOpen, CheckSquare2, ChevronDown, Code2, CreditCard, FileImage, FileText, GraduationCap, LayoutDashboard, LogOut, Megaphone, MessageSquareText, MessagesSquare, Route, Settings, ShieldCheck, Tags, TicketPercent, Users, Target, ListChecks, Files, Search, UsersRound, ChartNoAxesColumn } from "lucide-react";
import { getAdminSession } from "@/lib/server-auth";

const navGroups = [
  { label:"운영",items:[{ id:"dashboard",label:"오늘의 운영",href:"/admin",icon:LayoutDashboard }] },
  { label:"회원·참여",items:[{ id:"members",label:"회원 관리",href:"/admin/members",icon:Users },{ id:"groups",label:"회원 그룹 관리",href:"/admin/groups",icon:UsersRound },{ id:"participants",label:"참가자 현황",href:"/admin/participants",icon:ChartNoAxesColumn },{ id:"leads",label:"무료 콘텐츠 이용",href:"/admin/leads",icon:FileText }] },
  { label:"교육·상품",items:[{ id:"products",label:"강의 상품 관리",href:"/admin/products",icon:BookOpen },{ id:"digital-products",label:"디지털 상품 관리",href:"/admin/digital-products",icon:Files },{ id:"content",label:"커리큘럼·콘텐츠",href:"/admin/content",icon:FileText },{ id:"cohorts",label:"기수·회차",href:"/admin/cohorts",icon:GraduationCap }] },
  { label:"미션·평가",items:[{ id:"missions",label:"미션 관리",href:"/admin/missions",icon:Target },{ id:"quizzes",label:"확인 퀴즈",href:"/admin/quizzes",icon:ListChecks },{ id:"submissions",label:"미션 승인",href:"/admin/submissions",icon:CheckSquare2 },{ id:"reviews",label:"리뷰 관리",href:"/admin/reviews",icon:MessageSquareText }] },
  { label:"결제·사이트",items:[{ id:"orders",label:"주문·결제",href:"/admin/orders",icon:CreditCard },{ id:"coupons",label:"쿠폰",href:"/admin/coupons",icon:TicketPercent },{ id:"banners",label:"배너",href:"/admin/banners",icon:FileImage },{ id:"articles",label:"아티클 관리",href:"/admin/articles",icon:FileText }] },
  { label:"분석·마케팅",extra:true,items:[{ id:"analytics",label:"상세 운영 분석",href:"/admin/analytics",icon:LayoutDashboard },{ id:"journey",label:"행동·전환 분석",href:"/admin/journey",icon:Route },{ id:"member-tags",label:"고객 태그",href:"/admin/member-tags",icon:Tags },{ id:"crm",label:"마케팅 CRM",href:"/admin/crm",icon:Megaphone },{ id:"message-templates",label:"메시지 템플릿",href:"/admin/message-templates",icon:MessagesSquare }] },
  { label:"설정",items:[{ id:"super-admins",label:"관리자 계정 관리",href:"/admin/super-admins",icon:ShieldCheck },{ id:"seo",label:"SEO",href:"/admin/seo",icon:Search },{ id:"code-settings",label:"Meta / Header / Body",href:"/admin/code-settings",icon:Code2 },{ id:"settings",label:"사이트 설정",href:"/admin/settings",icon:Settings }] },
];

export async function AdminShell({active,children}:{active:string;children:React.ReactNode}){
  const operator=await getAdminSession();
  const isAdmin=operator?.role==="admin";
  const preferences=operator?.preferences||{};
  const canSee=(id:string)=>{
    if (isAdmin || id==="dashboard") return true;
    if (["members","groups","participants","submissions","leads"].includes(id)) return preferences.staffCanManageMembers===true;
    if (id==="orders") return preferences.staffCanManageOrders===true;
    if (["products","digital-products","content","missions","quizzes","cohorts","reviews","articles"].includes(id)) return preferences.staffCanManageProducts===true;
    return false;
  };
  const name=operator?.fullName||operator?.email?.split("@")[0]||"운영자";
  return <div className="admin-app"><a className="admin-skip-link" href="#admin-main">본문으로 바로가기</a><aside className="admin-sidebar"><div className="site-switcher"><span className="site-symbol">B</span><div><strong>브랜디액션 에듀</strong><small>교육 운영센터</small></div><ChevronDown aria-hidden="true"/></div><nav aria-label="관리자 메뉴">{navGroups.map((group)=>{const items=group.items.filter((item)=>canSee(item.id)); if (!items.length) return null; const links=items.map(({id,label,href,icon:Icon})=><Link key={id} href={href} prefetch={false} className={id===active?"active":""} aria-current={id===active?"page":undefined}><Icon aria-hidden="true"/>{label}</Link>);return group.extra?<details className="admin-nav-group admin-extra-nav" key={group.label} open={items.some((item)=>item.id===active)}><summary>{group.label}<ChevronDown/></summary>{links}</details>:<section className="admin-nav-group" key={group.label}><span>{group.label}</span>{links}</section>})}</nav><Link className="view-site" href="/"><LogOut aria-hidden="true"/>고객 사이트 보기</Link></aside><div className="admin-body"><header className="admin-topbar"><div><span>운영센터</span><strong>브랜디액션 에듀</strong></div><div><span className="user-avatar">{name[0]}</span><div><strong>{name}</strong><small>{isAdmin?"최고 관리자":"스태프"}</small></div></div></header><main className="admin-content" id="admin-main" tabIndex={-1}>{children}</main></div></div>
}

export function AdminPageTitle({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:React.ReactNode}){return <div className="admin-page-title"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>}
