import { RecruitmentDelivery } from '../../../app/ui/recruitment-delivery';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LandingAdmin } from '../../../app/ui/landing/admin';
import { WebinarRegistration } from '../../../app/ui/webinar-registration';
import { WebinarManagement } from '../../../app/ui/webinar-management';
import { AdminWorkflows } from '../../../app/ui/admin-workflows';
import { ConversionFixture } from './conversion';
import { AdminButton, AdminConfirmDialog, AdminDrawer, AdminInput } from '../../../app/ui/final/admin-system';
import '../../../app/ui/final/tokens.css';
import '../../../app/ui/final/admin-system.css';

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
createRoot(document.getElementById('root')!).render(<StrictMode><div className="edu-admin" style={{padding:24,minHeight:'180vh'}}>{window.location.pathname.startsWith('/delivery-test') ? <RecruitmentDelivery code="33333333-3333-4333-8333-333333333333"/> : window.location.pathname.startsWith('/templates-admin-test') ? <AdminWorkflows section="templates" data={{crm_templates:[],crm_delivery_state:[{id:'delivery',enabled:false,configured:false}]}} pending={false} send={async body=>{const r=await fetch('/api/platform/workflows',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('저장 실패');return r.json();}}/> : window.location.pathname.startsWith('/webinar-test') ? <WebinarRegistration code="11111111-1111-4111-8111-111111111111" channel="organic"/> : window.location.pathname.startsWith('/webinar-admin-test') ? <WebinarManagement workspace={new URLSearchParams(location.search).has("workspace")} period="sample" courses={[{id:'22222222-2222-4222-8222-222222222222',title:'합성 무료 교육'}]} cohorts={[]}/> : window.location.pathname.startsWith('/admin/conversion') ? <ConversionFixture/> : <><BoundaryFixture/><LandingAdmin/></>}</div></StrictMode>);
