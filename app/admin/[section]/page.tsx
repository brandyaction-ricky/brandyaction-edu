import { redirect } from "next/navigation";
import Link from "next/link";
import { Tags, Users } from "lucide-react";
import { AdminCohortsManager } from "../../components/admin-managers";
import { AdminProductsManager } from "../../components/admin-products-manager";
import { AdminSettingsManager } from "../../components/admin-settings-manager";
import { AdminLiveReviewsManager } from "../../components/admin-operational-managers";
import { AdminMembersManager } from "../../components/admin-members-manager";
import { AdminOrdersManager } from "../../components/admin-orders-manager";
import { AdminPageTitle, AdminShell } from "../../components/admin-shell";
import { AdminArticlesManager } from "../../components/admin-articles-manager";
import { AdminSuperAdminsManager } from "../../components/admin-super-admins-manager";
import { AdminCodeSettingsManager } from "../../components/admin-code-settings-manager";
import { AdminCrmManager } from "../../components/admin-crm-manager";
import { AdminMemberTagsManager } from "../../components/admin-member-tags-manager";
import { AdminCouponsManager } from "../../components/admin-coupons-manager";
import { AdminMessageTemplatesManager } from "../../components/admin-message-templates-manager";
import { AdminBannerManager } from "../../components/admin-banner-manager";
import { AdminSubmissionsManager } from "../../components/admin-submissions-manager";
import { getAdminUser, type AdminScope } from "@/lib/server-auth";

const info:Record<string,{eyebrow:string,title:string,desc:string}>={
  products:{eyebrow:"CLASSES",title:"클래스 관리",desc:"클래스 기본 정보·판매·모집 상태를 관리합니다. 콘텐츠 탭에서 영상·자료·미션을 등록할 수 있습니다."},
  content:{eyebrow:"CONTENT STUDIO",title:"콘텐츠·미션",desc:"주차별 콘텐츠, 가입 회원 무료자료와 실행 미션·확인 퀴즈를 관리합니다."},
  articles:{eyebrow:"GROWTH",title:"블로그 관리",desc:"칼럼·YouTube 영상과 카테고리, 회원 전용 무료강의 영역을 한곳에서 관리합니다."},
  banners:{eyebrow:"BANNERS",title:"배너 관리",desc:"메인 랜딩 이미지 배너를 여러 개 등록하고 슬라이드 연결 URL을 관리합니다."},
  cohorts:{eyebrow:"COHORTS",title:"기수·회차 관리",desc:"모집 일정부터 라이브 회차와 수강생까지 기수 단위로 운영합니다."},
  submissions:{eyebrow:"MISSION REVIEW",title:"과제 검토",desc:"교육생의 제출 내용을 확인하고 승인·반려 피드백과 달성도를 관리합니다."},
  members:{eyebrow:"MEMBERS",title:"회원 관리",desc:"상품·기수·고객 태그로 분류하고 수강권과 고객 상태를 한곳에서 관리합니다."},
  "member-tags":{eyebrow:"CUSTOMER TAGS",title:"고객 태그 관리",desc:"고객 분류 기준을 만들고 태그별 사용 인원을 관리합니다."},
  orders:{eyebrow:"ORDERS",title:"주문·결제 관리",desc:"프론트 결제와 연결된 상품·기수·승인·환불 데이터를 확인하고 처리합니다."},
  coupons:{eyebrow:"COUPONS",title:"쿠폰 관리",desc:"상품별 할인 조건, 사용 수량과 기간을 설정하고 실제 결제 적용 현황을 관리합니다."},
  reviews:{eyebrow:"REVIEWS",title:"후기 관리",desc:"수강 후기의 공개 상태와 메인 노출 여부를 관리합니다."},
  "super-admins":{eyebrow:"SECURITY",title:"최고 관리자 관리",desc:"전체 운영 권한을 가진 최고 관리자 계정을 등록하고 관리합니다."},
  "code-settings":{eyebrow:"SEARCH & CODE",title:"검색 및 코드 설정",desc:"검색 소유확인과 분석·광고 코드를 전체 사이트에 적용합니다."},
  crm:{eyebrow:"MARKETING CRM",title:"마케팅 CRM",desc:"대상을 분류하고 메시지를 준비한 뒤 최종 확인을 거쳐 실제 발송합니다."},
  "message-templates":{eyebrow:"MESSAGE TEMPLATES",title:"메시지 템플릿 관리",desc:"반복 발송할 메시지 정보와 클릭 버튼을 미리 만들어 CRM에서 선택해 사용합니다."},
  settings:{eyebrow:"SETTINGS",title:"사이트 설정",desc:"사이트 기본 정보, 메뉴, 약관과 운영자 권한을 설정합니다."}
};

export default async function AdminSection({params}:{params:Promise<{section:string}>}){
  const {section}=await params;
  const safeSection=info[section]?section:"products";
  const scope: AdminScope = ["orders","coupons"].includes(safeSection) ? "orders" : ["members", "member-tags", "submissions"].includes(safeSection) ? "members" : ["settings", "banners"].includes(safeSection) ? "settings" : safeSection === "articles" ? "articles" : "products";
  const operator = await getAdminUser(scope);
  if (!operator || (["super-admins", "code-settings", "message-templates", "crm", "member-tags", "coupons", "banners"].includes(safeSection) && operator.role !== "admin")) redirect("/admin?notice=permission_required");
  const meta=info[safeSection];
  return <AdminShell active={safeSection}><AdminPageTitle eyebrow={meta.eyebrow} title={meta.title} description={meta.desc} action={<SectionAction section={safeSection}/>}/><SectionContent section={safeSection}/></AdminShell>;
}

function SectionAction({section}:{section:string}){
  if(section==="members")return <Link className="admin-outline" href="/admin/member-tags"><Tags/>고객 태그 관리</Link>;
  if(section==="member-tags")return <Link className="admin-outline" href="/admin/members"><Users/>회원별 태그 지정</Link>;
  return null;
}

function SectionContent({section}:{section:string}){
  if(section==="products")return <AdminProductsManager/>;
  if(section==="content")return <AdminProductsManager contentMode/>;
  if(section==="banners")return <AdminBannerManager/>;
  if(section==="articles")return <AdminArticlesManager/>;
  if(section==="cohorts")return <AdminCohortsManager/>;
  if(section==="submissions")return <AdminSubmissionsManager/>;
  if(section==="settings")return <AdminSettingsManager/>;
  if(section==="orders")return <AdminOrdersManager/>;
  if(section==="coupons")return <AdminCouponsManager/>;
  if(section==="reviews")return <AdminLiveReviewsManager/>;
  if(section==="super-admins")return <AdminSuperAdminsManager/>;
  if(section==="code-settings")return <AdminCodeSettingsManager/>;
  if(section==="crm")return <AdminCrmManager/>;
  if(section==="message-templates")return <AdminMessageTemplatesManager/>;
  if(section==="members")return <AdminMembersManager/>;
  if(section==="member-tags")return <AdminMemberTagsManager/>;
  return null;
}
