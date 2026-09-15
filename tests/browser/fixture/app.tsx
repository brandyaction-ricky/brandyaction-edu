import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LandingAdmin } from '../../../app/ui/landing/admin';
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
createRoot(document.getElementById('root')!).render(<StrictMode><div className="edu-admin" style={{padding:24,minHeight:'180vh'}}><BoundaryFixture/><LandingAdmin/></div></StrictMode>);
