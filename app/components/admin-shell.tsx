import Link from "next/link";
import Image from "next/image";
import { BookOpen, ChevronDown, Code2, CreditCard, FileText, GraduationCap, LayoutDashboard, LogOut, Megaphone, MessageSquareText, Settings, ShieldCheck, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDevelopmentAdminBypassEnabled } from "@/lib/app-environment";
import { getAdminUser } from "@/lib/server-auth";

const nav = [
  { id:"dashboard",label:"대시보드",href:"/admin",icon:LayoutDashboard },
  { id:"products",label:"상품 관리",href:"/admin/products",icon:BookOpen },
  { id:"articles",label:"아티클 관리",href:"/admin/articles",icon:FileText },
  { id:"cohorts",label:"기수·회차 관리",href:"/admin/cohorts",icon:GraduationCap },
  { id:"members",label:"회원 관리",href:"/admin/members",icon:Users },
  { id:"orders",label:"주문·결제",href:"/admin/orders",icon:CreditCard },
  { id:"reviews",label:"리뷰 관리",href:"/admin/reviews",icon:MessageSquareText },
  { id:"super-admins",label:"최고 관리자",href:"/admin/super-admins",icon:ShieldCheck },
  { id:"code-settings",label:"검색·코드 설정",href:"/admin/code-settings",icon:Code2 },
  { id:"crm",label:"마케팅 CRM",href:"/admin/crm",icon:Megaphone },
  { id:"settings",label:"사이트 설정",href:"/admin/settings",icon:Settings },
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
  const visibleNav=nav.filter(item=>item.id==="dashboard"||isAdmin||(item.id==="super-admins"||item.id==="code-settings"||item.id==="crm"||item.id==="settings"?false:item.id==="orders"?preferences.staffCanManageOrders===true:item.id==="members"?preferences.staffCanManageMembers===true:preferences.staffCanManageProducts===true));
  const name=profile?.full_name||developmentOperator?.email?.split("@")[0]||userData.user?.email?.split("@")[0]||"운영자";
  return <div className="admin-app"><aside className="admin-sidebar"><Link href="/" className="admin-logo" aria-label="Brandy Action 고객 사이트"><Image src="/brandy-action-logo.png" alt="Brandy Action" width={311} height={79}/><small>EDU ADMIN</small></Link><div className="site-switcher"><span className="site-symbol">B</span><div><strong>브랜디액션 에듀</strong><small>운영 중</small></div><ChevronDown/></div><nav>{visibleNav.map(({id,label,href,icon:Icon})=><Link key={id} href={href} className={id===active?"active":""}><Icon/>{label}</Link>)}</nav><Link className="view-site" href="/"><LogOut/>고객 사이트 보기</Link></aside><div className="admin-body"><header className="admin-topbar"><div><span>운영센터</span><strong>브랜디액션 에듀</strong></div><div><span className="user-avatar">{name[0]}</span><div><strong>{name}</strong><small>{isAdmin?"최고 관리자":"스태프"}</small></div><ChevronDown/></div></header><div className="admin-content">{children}</div></div></div>
}

export function AdminPageTitle({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:React.ReactNode}){return <div className="admin-page-title"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>}
