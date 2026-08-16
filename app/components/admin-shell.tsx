import Link from "next/link";
import { BookOpen, ChevronDown, Code2, CreditCard, FileText, GraduationCap, LayoutDashboard, LogOut, Megaphone, MessageSquareText, Route, Settings, ShieldCheck, Tags, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDevelopmentAdminBypassEnabled } from "@/lib/app-environment";
import { getAdminUser } from "@/lib/server-auth";

const navGroups = [
  { label:"운영 현황",items:[{ id:"dashboard",label:"대시보드",href:"/admin",icon:LayoutDashboard },{ id:"journey",label:"행동·전환 분석",href:"/admin/journey",icon:Route }] },
  { label:"교육 운영",items:[{ id:"products",label:"상품 관리",href:"/admin/products",icon:BookOpen },{ id:"cohorts",label:"기수·회차 관리",href:"/admin/cohorts",icon:GraduationCap },{ id:"reviews",label:"후기 관리",href:"/admin/reviews",icon:MessageSquareText }] },
  { label:"고객·매출",items:[{ id:"members",label:"회원 관리",href:"/admin/members",icon:Users },{ id:"member-tags",label:"고객 태그 관리",href:"/admin/member-tags",icon:Tags },{ id:"orders",label:"주문·결제",href:"/admin/orders",icon:CreditCard }] },
  { label:"콘텐츠 관리",items:[{ id:"articles",label:"아티클 관리",href:"/admin/articles",icon:FileText }] },
  { label:"마케팅 관리",items:[{ id:"code-settings",label:"검색·코드 설정",href:"/admin/code-settings",icon:Code2 },{ id:"crm",label:"마케팅 CRM",href:"/admin/crm",icon:Megaphone }] },
  { label:"시스템 관리",items:[{ id:"super-admins",label:"최고 관리자",href:"/admin/super-admins",icon:ShieldCheck },{ id:"settings",label:"사이트 설정",href:"/admin/settings",icon:Settings }] },
];

export async function AdminShell({active,children}:{active:string;children:React.ReactNode}){
  const developmentBypass=isDevelopmentAdminBypassEnabled();
  const supabase=await createClient();
  const {data:userData}=developmentBypass?{data:{user:null}}:await supabase.auth.getUser();
  const developmentOperator=developmentBypass?await getAdminUser():null;
  const {data:profile}=developmentOperator
    ?await createAdminClient().from("profiles").select("full_name,role").eq("id",developmentOperator.id).maybeSingle()
    :userData.user
      ?await supabase.from("profiles").select("full_name,role").eq("id",userData.user.id).maybeSingle()
      :{data:null};
  const isAdmin=profile?.role==="admin";
  let preferences:Record<string,unknown>={};
  if(!isAdmin){const {data}=await createAdminClient().from("site_settings").select("value").eq("key","operator_preferences").maybeSingle();if(data?.value&&typeof data.value==="object"&&!Array.isArray(data.value))preferences=data.value as Record<string,unknown>}
  const canSee=(id:string)=>id==="dashboard"||id==="journey"||isAdmin||(id==="super-admins"||id==="code-settings"||id==="crm"||id==="member-tags"||id==="settings"?false:id==="orders"?preferences.staffCanManageOrders===true:id==="members"?preferences.staffCanManageMembers===true:preferences.staffCanManageProducts===true);
  const name=profile?.full_name||developmentOperator?.email?.split("@")[0]||userData.user?.email?.split("@")[0]||"운영자";
  return <div className="admin-app"><aside className="admin-sidebar"><div className="site-switcher"><span className="site-symbol">B</span><div><strong>브랜디액션 에듀</strong><small>운영 중</small></div><ChevronDown/></div><nav>{navGroups.map((group)=>{const items=group.items.filter((item)=>canSee(item.id));return items.length?<section className="admin-nav-group" key={group.label}><span>{group.label}</span>{items.map(({id,label,href,icon:Icon})=><Link key={id} href={href} className={id===active?"active":""}><Icon/>{label}</Link>)}</section>:null})}</nav><Link className="view-site" href="/"><LogOut/>고객 사이트 보기</Link></aside><div className="admin-body"><header className="admin-topbar"><div><span>운영센터</span><strong>브랜디액션 에듀</strong></div><div><span className="user-avatar">{name[0]}</span><div><strong>{name}</strong><small>{isAdmin?"최고 관리자":"스태프"}</small></div><ChevronDown/></div></header><div className="admin-content">{children}</div></div></div>
}

export function AdminPageTitle({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:React.ReactNode}){return <div className="admin-page-title"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>}
