import { useState } from 'react';
import { AdminShell, AdminPageHeader } from '../../../features/admin-ui';
import { MarketingWorkspaceNav } from '../../../app/ui/marketing-workspace-nav';
import { AdminWorkflows } from '../../../app/ui/admin-workflows';
import { sections, type Row } from '../../../lib/platform';

// Local UI fixture only: no customer data, server authentication or message delivery.
export function AdminUxAuditFixture() {
  const [mobile, setMobile] = useState(false);
  const [saved, setSaved] = useState(0);
  const staff = new URLSearchParams(location.search).has('restricted');
  const available = staff ? sections.filter(s => ['templates', 'questions'].includes(s.key)) : sections;
  const [templates, setTemplates] = useState<Row[]>(Array.from({ length: 12 }, (_, i) => ({
    id: `ux-template-${i}`, name: i === 11 ? '마지막 학습 안내' : `학습 안내 ${i + 1}`,
    channel: 'lms', purpose: 'transactional', content: '다음 학습을 확인해 주세요. 질문이 있으면 질문·답변에서 도와드릴게요.', is_active: i % 2 === 0,
  })));
  return <main className="edu-admin adm adm-shell">
    <AdminShell current="templates" available={available} user={{ full_name: '시험 운영자', role: staff ? 'staff' : 'admin' }} mobile={mobile} setMobile={setMobile} logout={async () => {}}>
      <MarketingWorkspaceNav current="templates" available={available} prefetchSection={() => {}} />
      <AdminPageHeader title="메시지 템플릿" description="반복 안내에 사용할 문구를 관리합니다." />
      <p className="meta">시험 화면 · 실제 수강생에게 발송되지 않습니다.</p>
      <AdminWorkflows section="templates" pending={false} data={{
        crm_templates: templates,
        crm_delivery_state: [{ id: 'delivery', enabled: false, configured: false }],
        crm_sms_settings: [{ id: 'sms', canConfigure: false, senders: [], optouts: [] }],
      }} send={async body => {
        setSaved(value => value + 1);
        if (body.action === 'crm-save') setTemplates(current => body.id ? current.map(row => row.id === body.id ? { ...row, name: body.name, content: body.content } : row) : [...current, { id: `new-${saved}`, name: body.name, content: body.content, channel: body.channel, purpose: body.purpose, is_active: true }]);
        return { ok: true };
      }} />
      <output aria-label="시험 저장 횟수">{saved}</output>
    </AdminShell>
  </main>;
}
