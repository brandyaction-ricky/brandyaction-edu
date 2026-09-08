import Link from "next/link";
import { BookOpen, CheckSquare2, ChevronDown, Code2, CreditCard, FileImage, FileText, GraduationCap, LayoutDashboard, LogOut, Megaphone, MessageSquareText, MessagesSquare, Route, Settings, ShieldCheck, Tags, TicketPercent, Users } from "lucide-react";
import { getAdminSession } from "@/lib/server-auth";

const navGroups = [
  { label:"운영",items:[{ id:"dashboard",label:"오늘의 운영",href:"/admin",icon:LayoutDashboard }] },
  { label:"교육·콘텐츠",items:[{ id:"products",label:"클래스 관리",href:"/admin/products",icon:BookOpen },{ id:"content",label:"콘텐츠·미션",href:"/admin/content",icon:FileText },{ id:"cohorts",label:"기수·회차",href:"/admin/cohorts",icon:GraduationCap }] },
  { label:"수강생·승인",items:[{ id:"submissions",label:"미션 승인",href:"/admin/submissions",icon:CheckSquare2 },{ id:"members",label:"회원·달성도",href:"/admin/members",icon:Users },{ id:"leads",label:"무료 콘텐츠 이용",href:"/admin/leads",icon:FileText },{ id:"reviews",label:"수강 후기",href:"/admin/reviews",icon:MessageSquareText }] },
  { label:"결제·사이트",items:[{ id:"orders",label:"주문·결제",href:"/admin/orders",icon:CreditCard },{ id:"coupons",label:"쿠폰",href:"/admin/coupons",icon:TicketPercent },{ id:"banners",label:"배너",href:"/admin/banners",icon:FileImage },{ id:"articles",label:"블로그",href:"/admin/articles",icon:FileText }] },
  { label:"분석·마케팅",extra:true,items:[{ id:"analytics",label:"상세 운영 분석",href:"/admin/analytics",icon:LayoutDashboard },{ id:"journey",label:"행동·전환 분석",href:"/admin/journey",icon:Route },{ id:"member-tags",label:"고객 태그",href:"/admin/member-tags",icon:Tags },{ id:"crm",label:"마케팅 CRM",href:"/admin/crm",icon:Megaphone },{ id:"message-templates",label:"메시지 템플릿",href:"/admin/message-templates",icon:MessagesSquare },{ id:"code-settings",label:"검색·코드",href:"/admin/code-settings",icon:Code2 }] },
  { label:"설정",extra:true,items:[{ id:"super-admins",label:"관리자 권한",href:"/admin/super-admins",icon:ShieldCheck },{ id:"settings",label:"사이트 설정",href:"/admin/settings",icon:Settings }] },
];

export async function AdminShell({active,children}:{active:string;children:React.ReactNode}){
  const operator=await getAdminSession();
  const isAdmin=operator?.role==="admin";
  const preferences=operator?.preferences||{};
  const canSee=(id:string)=>{
    if (isAdmin || id==="dashboard") return true;
    if (["members","submissions","leads"].includes(id)) return preferences.staffCanManageMembers===true;
    if (id==="orders") return preferences.staffCanManageOrders===true;
    if (["products","content","cohorts","reviews","articles"].includes(id)) return preferences.staffCanManageProducts===true;
    return false;
  };
  const name=operator?.fullName||operator?.email?.split("@")[0]||"운영자";
  return <div className="admin-app"><a className="admin-skip-link" href="#admin-main">본문으로 바로가기</a><aside className="admin-sidebar"><div className="site-switcher"><span className="site-symbol">B</span><div><strong>브랜디액션 에듀</strong><small>교육 운영센터</small></div><ChevronDown aria-hidden="true"/></div><nav aria-label="관리자 메뉴">{navGroups.map((group)=>{const items=group.items.filter((item)=>canSee(item.id)); if (!items.length) return null; const links=items.map(({id,label,href,icon:Icon})=><Link key={id} href={href} prefetch={false} className={id===active?"active":""} aria-current={id===active?"page":undefined}><Icon aria-hidden="true"/>{label}</Link>);return group.extra?<details className="admin-nav-group admin-extra-nav" key={group.label} open={items.some((item)=>item.id===active)}><summary>{group.label}<ChevronDown/></summary>{links}</details>:<section className="admin-nav-group" key={group.label}><span>{group.label}</span>{links}</section>})}</nav><Link className="view-site" href="/"><LogOut aria-hidden="true"/>고객 사이트 보기</Link></aside><div className="admin-body"><header className="admin-topbar"><div><span>운영센터</span><strong>브랜디액션 에듀</strong></div><div><span className="user-avatar">{name[0]}</span><div><strong>{name}</strong><small>{isAdmin?"최고 관리자":"스태프"}</small></div></div></header><main className="admin-content" id="admin-main" tabIndex={-1}>{children}</main></div></div>
}

export function AdminPageTitle({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:React.ReactNode}){return <div className="admin-page-title"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>}
