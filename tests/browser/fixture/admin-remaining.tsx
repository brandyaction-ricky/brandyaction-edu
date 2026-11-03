import { useState } from 'react';
import { AdminShell, AdminPageHeader } from '../../../features/admin-ui';
import { AdminWorkflows } from '../../../app/ui/admin-workflows';
import { MarketingWorkspaceNav } from '../../../app/ui/marketing-workspace-nav';
import { sections } from '../../../lib/platform';

// Real forms, synthetic records and an in-memory transport only. No DB or delivery.
export function AdminRemainingFixture() {
  const key = new URLSearchParams(location.search).get('remaining') || 'templates';
  const [mobile, setMobile] = useState(false);
  const [saved, setSaved] = useState<unknown>(null);
  return <main className="edu-admin adm adm-shell">
    <AdminShell current={key} available={sections} user={{ full_name: '합성 운영자', role: 'admin' }} mobile={mobile} setMobile={setMobile} logout={async () => {}}>
      {['campaigns', 'templates', 'automations', 'seo', 'settings', 'analytics', 'landing'].includes(key) && <MarketingWorkspaceNav current={key} available={sections} prefetchSection={() => {}}/>}
      <AdminPageHeader title={sections.find(s => s.key === key)?.title || key} description="합성 데이터 · 실제 저장과 발송에 연결되지 않습니다."/>
      <AdminWorkflows section={key} pending={false} data={{
        site_settings: [{ id: 'seo', key: 'edu_seo', value: { title: '합성 사이트 제목', description: '합성 사이트 설명' } }],
        courses: [{ id: 'course-a', title: '합성 클래스' }],
        curriculum_lessons: [{ id: 'lesson-a', title: '합성 학습' }],
        curriculum_missions: [{ id: 'mission-a', lesson_id: 'lesson-a', title: '합성 미션' }],
        crm_templates: [{ id: 'template-a', name: '합성 템플릿', channel: 'lms', purpose: 'transactional', content: '안전한 합성 안내', is_active: true }],
        crm_campaigns: [], crm_automations: [],
        crm_delivery_state: [{ id: 'delivery', enabled: false, configured: false }],
        crm_sms_settings: [{ id: 'sms', canConfigure: false, senders: [], optouts: [] }],
      }} send={async body => { setSaved(body); return {}; }}/>
      <output aria-label="합성 저장 요청">{JSON.stringify(saved)}</output>
    </AdminShell>
  </main>;
}
