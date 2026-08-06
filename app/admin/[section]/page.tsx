import { Download, Eye, Filter, MoreHorizontal, Search, UserPlus } from "lucide-react";
import { AdminCohortsManager, AdminOrdersManager, AdminProductsManager, AdminReviewsManager, AdminSettingsManager } from "../../components/admin-managers";
import { AdminPageTitle, AdminShell } from "../../components/admin-shell";

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
  const meta=info[safeSection];
  return <AdminShell active={safeSection}><AdminPageTitle eyebrow={meta.eyebrow} title={meta.title} description={meta.desc} action={<SectionAction section={safeSection}/>}/><SectionContent section={safeSection}/></AdminShell>;
}

function SectionAction({section}:{section:string}){
  if(section==="orders")return <button className="admin-outline"><Download/>엑셀 다운로드</button>;
  if(section==="members")return <button className="admin-primary"><UserPlus/>회원 추가</button>;
  if(section==="reviews")return <button className="admin-outline"><Download/>리뷰 내보내기</button>;
  return null;
}

function ToolBar({placeholder="검색어를 입력하세요"}:{placeholder?:string}){return <div className="admin-toolbar"><div className="search-box"><Search/><input placeholder={placeholder}/></div><button><Filter/>필터</button><button>전체 상태⌄</button></div>}

function SectionContent({section}:{section:string}){
  if(section==="products")return <AdminProductsManager/>;
  if(section==="cohorts")return <AdminCohortsManager/>;
  if(section==="settings")return <AdminSettingsManager/>;
  if(section==="orders")return <AdminOrdersManager/>;
  if(section==="reviews")return <AdminReviewsManager/>;
  if(section==="members")return <><div className="summary-chips"><span>전체 회원 <strong>1,284</strong></span><span>신규 회원 <strong>184</strong></span><span>수강 중 <strong>51</strong></span><span>휴면·탈퇴 <strong>28</strong></span></div><section className="admin-panel table-panel"><ToolBar placeholder="이름, 이메일, 휴대폰 검색"/><div className="data-table member-table"><div className="data-head"><span>회원</span><span>회원 그룹</span><span>수강 중</span><span>누적 결제</span><span>가입일</span><span>상태</span><span/></div>{[["김민지","minji@naver.com","1기 수강생","1개","450,000원","08.03"],["박성호","park@kakao.com","수료생·VIP","0개","840,000원","07.18"],["이지은","jieun@gmail.com","1기 수강생","1개","490,000원","08.02"],["최현우","choi@naver.com","일반 회원","0개","0원","08.01"]].map((r,i)=><div className="data-row" key={r[1]}><span className="member-name"><b className="mini-avatar">{r[0][0]}</b><span><strong>{r[0]}</strong><small>{r[1]}</small></span></span><span>{r[2]}</span><strong>{r[3]}</strong><span>{r[4]}</span><span>2026.{r[5]}</span><span className={`status-label ${i===3?"planned":"success"}`}>{i===3?"미구매":"활성"}</span><button><MoreHorizontal/></button></div>)}</div></section></>;
  if(section==="orders")return <><section className="order-metrics"><article><span>오늘 결제액</span><strong>2,340,000원</strong><small>7건</small></article><article><span>이번 달 결제액</span><strong>12,840,000원</strong><small>38건</small></article><article><span>환불액</span><strong>450,000원</strong><small>1건 · 승인 완료</small></article><article><span>결제 전환율</span><strong>8.4%</strong><small>+1.2%p</small></article></section><section className="admin-panel table-panel"><ToolBar placeholder="주문번호, 주문자, 상품명 검색"/><div className="data-table order-table"><div className="data-head"><span>주문번호</span><span>주문자</span><span>상품</span><span>결제 금액</span><span>결제 수단</span><span>상태</span><span/></div>{[["BA260803-0124","김민지","자영업 마케팅 실전반 1기","450,000원","신용카드","결제 완료"],["BA260803-0123","이지은","자영업 마케팅 실전반 1기","450,000원","카카오페이","결제 완료"],["BA260802-0122","정수현","자영업 마케팅 실전반 1기","450,000원","가상계좌","입금 대기"],["BA260801-0118","최영호","자영업 마케팅 실전반 0기","450,000원","신용카드","환불 완료"]].map((r,i)=><div className="data-row" key={r[0]}><strong>{r[0]}</strong><span>{r[1]}</span><span>{r[2]}</span><strong>{r[3]}</strong><span>{r[4]}</span><span className={`status-label ${i===3?"refund":i===2?"planned":"success"}`}>{r[5]}</span><button><MoreHorizontal/></button></div>)}</div></section></>;
  return <><div className="review-admin-summary"><article><span>전체 리뷰</span><strong>128</strong></article><article><span>평균 평점</span><strong>4.9 <small>/ 5</small></strong></article><article><span>메인 노출</span><strong className="red">6</strong></article><article><span>공개 대기</span><strong>3</strong></article></div><section className="admin-panel review-admin-list"><ToolBar placeholder="작성자 또는 상품 검색"/>{[["김민지","자영업 마케팅 실전반 0기","5.0","막연했던 고객이 구체적으로 보이기 시작했어요. 우리 매장이 바꿔야 할 순서가 명확해졌습니다.","메인 노출"],["박성호","자영업 마케팅 실전반 0기","5.0","매주 결과물이 남아서 팀원들과 바로 실행할 수 있었습니다.","공개"],["이지은","자영업 마케팅 실전반 0기","4.8","고객 정의를 바꾼 뒤 상담 문의의 질이 달라졌습니다.","공개"]].map((r,i)=><article className="review-admin-card" key={r[0]}><div className="reviewer"><b className="mini-avatar">{r[0][0]}</b><div><strong>{r[0]}</strong><small>{r[1]} · 08.0{3-i}</small></div></div><div className="rating">★★★★★ <strong>{r[2]}</strong></div><p>{r[3]}</p><div className="review-controls"><span className={`status-label ${i===0?"live":"success"}`}>{r[4]}</span><button>{i===0?"메인 해제":"메인 노출"}</button><button><Eye/> 미리보기</button><button><MoreHorizontal/></button></div></article>)}</section></>;
}
