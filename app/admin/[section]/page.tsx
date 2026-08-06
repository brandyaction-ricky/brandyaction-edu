import { redirect } from "next/navigation";
import { AdminCohortsManager, AdminProductsManager, AdminSettingsManager } from "../../components/admin-managers";
import { AdminLiveOrdersManager, AdminLiveReviewsManager, AdminMembersManager } from "../../components/admin-operational-managers";
import { AdminPageTitle, AdminShell } from "../../components/admin-shell";
import { getAdminUser, type AdminScope } from "@/lib/server-auth";

const info:Record<string,{eyebrow:string,title:string,desc:string}>={
  products:{eyebrow:"PRODUCTS",title:"상품 관리",desc:"상품 정보부터 이미지 상세페이지·커리큘럼·전환 픽셀까지 관리합니다."},
  cohorts:{eyebrow:"COHORTS",title:"기수·회차 관리",desc:"모집 일정부터 라이브 회차와 수강생까지 기수 단위로 운영합니다."},
  members:{eyebrow:"MEMBERS",title:"회원 관리",desc:"가입 회원의 구매·수강 이력과 그룹을 관리합니다."},
  orders:{eyebrow:"ORDERS",title:"주문·결제 관리",desc:"결제, 취소, 환불 내역을 확인하고 처리합니다."},
  reviews:{eyebrow:"REVIEWS",title:"리뷰 관리",desc:"수강 후기의 공개 상태와 메인 노출 여부를 관리합니다."},
  settings:{eyebrow:"SETTINGS",title:"사이트 설정",desc:"메인 배너, 메뉴, 약관과 운영자 권한을 설정합니다."}
};

export default async function AdminSection({params}:{params:Promise<{section:string}>}){
  const {section}=await params;
  const safeSection=info[section]?section:"products";
  const scope: AdminScope = safeSection === "orders" ? "orders" : safeSection === "members" ? "members" : safeSection === "settings" ? "settings" : "products";
  if (!await getAdminUser(scope)) redirect("/admin?notice=permission_required");
  const meta=info[safeSection];
  return <AdminShell active={safeSection}><AdminPageTitle eyebrow={meta.eyebrow} title={meta.title} description={meta.desc} action={<SectionAction section={safeSection}/>}/><SectionContent section={safeSection}/></AdminShell>;
}

function SectionAction({section}:{section:string}){
  void section;
  return null;
}

function SectionContent({section}:{section:string}){
  if(section==="products")return <AdminProductsManager/>;
  if(section==="cohorts")return <AdminCohortsManager/>;
  if(section==="settings")return <AdminSettingsManager/>;
  if(section==="orders")return <AdminLiveOrdersManager/>;
  if(section==="reviews")return <AdminLiveReviewsManager/>;
  if(section==="members")return <AdminMembersManager/>;
  return null;
}
