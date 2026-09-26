import { RecruitmentLinks } from '../../../app/ui/recruitment-links';
import { RecruitmentDelivery } from '../../../app/ui/recruitment-delivery';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LandingAdmin } from '../../../app/ui/landing/admin';
import { WebinarRegistration } from '../../../app/ui/webinar-registration';
import { WebinarManagement } from '../../../app/ui/webinar-management';
import { AdminWorkflows } from '../../../app/ui/admin-workflows';
import { ConversionFixture } from './conversion';
import { MissionIntegrityFixture } from './mission-integrity';
import { MemberOperationsFixture, RetainedMemberDialogFixture } from './member-operations';
import { SubmissionReviewFixture } from './submission-review';
import { ProductSaleFixture } from './product-sale';
import { AdminButton, AdminConfirmDialog, AdminDrawer, AdminEmptyState, AdminInlineError, AdminInput, AdminPage, AdminPageHeader, AdminShell, AdminSuccessState } from '../../../features/admin-ui';
import { ProductDetailHtml } from '../../../app/ui/final/product-detail-html';
import '../../../app/ui/final/tokens.css';
import '../../../app/ui/final/admin.css';
import '../../../features/admin-ui/styles/admin-system.css';
import '../../../app/ui/final/integration.css';

function BoundaryFixture() {
  const [open, setOpen] = useState(false), [confirm, setConfirm] = useState(false), [extra, setExtra] = useState(false);
  return <section><AdminButton onClick={() => setOpen(true)}>경계 조건 Drawer</AdminButton>{open && <AdminDrawer title="경계 조건" onClose={() => setOpen(false)}>
    <div className="admin-dialog-body">
      <AdminButton onClick={() => setConfirm(true)}>중첩 확인</AdminButton>
      <AdminButton onClick={() => setExtra(value => !value)}>활성 요소 전환</AdminButton>
      <AdminInput label="마지막 입력"/>
      <button disabled={!extra}>동적 마지막 버튼</button>
      <button disabled>disabled 제외</button><fieldset disabled><input aria-label="비활성 fieldset 제외"/></fieldset>
      <div hidden><button>hidden 제외</button></div><button style={{display:'none'}}>display none 제외</button>
      <button style={{visibility:'hidden'}}>visibility hidden 제외</button><div inert><button>inert 제외</button></div>
      <button tabIndex={-1}>음수 tabindex 제외</button>
    </div>
    {confirm && <AdminConfirmDialog title="중첩 확인" message="상위 Drawer는 유지됩니다." onCancel={() => setConfirm(false)} onConfirm={() => {setConfirm(false);setOpen(false);}}/>}
  </AdminDrawer>}</section>;
}
function ShellFixture() {
  const [mobile, setMobile] = useState(false);
  const available = [
    { key: 'products', title: '상품 관리' },
    { key: 'weeks', title: '주차 구성' },
    { key: 'contents', title: '영상·자료 등록' },
    { key: 'orders', title: '주문 결제' },
  ];
  return <div className="edu-admin"><AdminShell current="overview" available={available} user={{full_name:'운영자',role:'staff'}} pendingReviews={3} mobile={mobile} setMobile={setMobile} logout={async()=>{}}><AdminPage><AdminPageHeader eyebrow="OPERATIONS" title="오늘의 운영" description="현재 상태를 확인하고 다음 작업을 시작하세요." actions={<AdminButton tone="primary">핵심 작업 시작</AdminButton>}/><AdminSuccessState title="대기 업무를 모두 처리했습니다.">새 요청이 생기면 이 화면과 메뉴 배지에 표시됩니다.</AdminSuccessState><AdminEmptyState title="조회 결과가 없습니다.">검색어 또는 필터를 변경해 보세요.</AdminEmptyState><AdminInlineError onRetry={()=>{}}>화면 정보를 불러오지 못했습니다.</AdminInlineError></AdminPage></AdminShell></div>;
}

function ProductHtmlCtaFixture() {
  const documentSource = '<!doctype html><html><body><a href="#faq">자주 묻는 질문</a><a href="#">무료강의 대기방 입장 →</a><p id="faq">FAQ</p></body></html>';
  return <ProductDetailHtml html="" documentSource={documentSource} ctaUrl="/join/synthetic/organic" />;
}
const path = window.location.pathname;
const fixture = path === '/analytics-test' ? <div className="edu-admin" style={{padding:24}}><AdminWorkflows section="analytics" data={{}} pending={false} send={async()=>({})}/></div> : path === '/review-audit-test' ? <SubmissionReviewFixture/> : path === '/retained-member-dialog-test' ? <RetainedMemberDialogFixture/> : ['/member-operations-test', '/admin/customers', '/admin/questions', '/admin/reviews', '/admin/members'].includes(path) ? <MemberOperationsFixture/> : path.startsWith('/mission-integrity-test') ? <MissionIntegrityFixture/> : path.startsWith('/admin-shell-test')
  ? <ShellFixture/>
  : path.startsWith('/product-html-cta-test')
    ? <ProductHtmlCtaFixture/>
    : <div className="edu-admin" style={{padding:24,minHeight:'180vh'}}>{path.startsWith('/copy-links-test') ? <><RecruitmentLinks period="sample" version={2}/><WebinarManagement period="sample" courses={[{id:'22222222-2222-4222-8222-222222222222',title:'합성 무료 교육'}]} cohorts={[]}/></> : path.startsWith('/delivery-test') ? <RecruitmentDelivery code="33333333-3333-4333-8333-333333333333"/> : path.startsWith('/templates-admin-test') ? <AdminWorkflows section="templates" data={{crm_templates:[],crm_delivery_state:[{id:'delivery',enabled:false,configured:false}]}} pending={false} send={async body=>{const r=await fetch('/api/platform/workflows',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('저장 실패');return r.json();}}/> : path.startsWith('/webinar-test') ? <WebinarRegistration code="11111111-1111-4111-8111-111111111111" channel="organic"/> : path.startsWith('/webinar-admin-test') ? <WebinarManagement workspace={new URLSearchParams(location.search).has("workspace")} period="sample" courses={[{id:'22222222-2222-4222-8222-222222222222',title:'합성 무료 교육'}]} cohorts={[]}/> : path.startsWith('/admin/conversion') ? <ConversionFixture/> : <><BoundaryFixture/><LandingAdmin/></>}</div>;
createRoot(document.getElementById('root')!).render(<StrictMode>{path === '/product-sale-test' ? <ProductSaleFixture /> : fixture}</StrictMode>);
