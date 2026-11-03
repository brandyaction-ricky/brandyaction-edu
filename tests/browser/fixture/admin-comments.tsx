import { useState } from 'react';
import { AdminShell, AdminPageHeader } from '../../../features/admin-ui';
import { AdminCatalog } from '../../../app/ui/final/admin-catalog';
import { AdminWorkflows } from '../../../app/ui/admin-workflows';
import { MarketingWorkspaceNav } from '../../../app/ui/marketing-workspace-nav';
import { ConversionFixture } from './conversion';
import { sections, type Row } from '../../../lib/platform';
import type { MemberDirectoryScope } from '../../../lib/member-directory';

const profiles: Row[] = Array.from({ length: 200 }, (_, index) => ({
  id: `member-${index}`, full_name: index === 0 ? '기존 스태프' : index === 1 ? '최고 관리자' : `검수 회원 ${index}`,
  email: `member${index}@example.test`, status: index === 199 ? 'suspended' : 'active',
  role: index === 0 ? 'staff' : index === 1 ? 'admin' : 'student', created_at: '2026-10-28',
}));
const course = { id: 'course-a', title: '합성 클래스', status: 'published' };
const questions = Array.from({ length: 85 }, (_, index) => ({
  id: `question-${index}`, title: `${index + 1}번째 질문 · 긴 제목도 줄바꿈해서 확인할 수 있나요?`,
  content: index === 0 ? '질문 전체 본문을 유지합니다. '.repeat(300) + '본문 끝 확인' : `${index + 1}번째 질문 본문`,
  profiles: profiles[0], courses: course, user_id: profiles[0].id, status: 'open',
  created_at: '2026-10-28', is_archived: false,
}));

// Actual UI components over synthetic records; save captures only in memory.
// No authentication, customer DB or real permission mutations are connected.
export function AdminCommentsFixture() {
  const key = new URLSearchParams(location.search).get('comments') || 'coupons';
  const section = sections.find(item => item.key === key) || sections.find(item => item.key === 'coupons')!;
  const [mobile, setMobile] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [scope, setScope] = useState<MemberDirectoryScope>({ query: '', status: '', course: '' });
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null);
  const seed = [{ id: 'record-a', title: '검수 항목', name: '검수 항목', code: 'QA-ONLY', discount_type: 'fixed', discount_value: 1000, product_scope: 'all', tag_kind: 'manual', rule_key: 'signed_up', is_active: true, status: 'published', is_published: true, content_type: 'column', reviewer_name: '합성 고객', created_at: '2026-10-28' }];
  const data = {
    [section.table]: seed,
    profiles: key === 'customers' ? profiles.slice(0, 3) : profiles,
    edu_questions: questions, courses: [course],
    site_settings: [{ id: 'permissions', key: 'edu_staff_permissions_member-0', value: { products: true, members: true, orders: false, content: false, marketing: false } }],
  };
  return <main className="edu-admin adm adm-shell">
    <AdminShell current={key} available={sections} user={{ full_name: '합성 관리자', role: 'admin' }} mobile={mobile} setMobile={setMobile} logout={async () => {}}>
      {key === 'conversion' && <MarketingWorkspaceNav current="conversion" available={sections} prefetchSection={() => {}}/>}
      <AdminPageHeader eyebrow="ADMIN UI QA" title={section.title} description="화면 검수용 합성 데이터입니다. 실제 데이터와 연결되지 않습니다."/>
      {key === 'staff' || key === 'members' || key === 'orders'
        ? <AdminWorkflows section={key} data={data} pending={false} send={async body => { setSaved(body); return {}; }}/>
        : key === 'conversion' ? <ConversionFixture/>
        : <AdminCatalog key={key === 'customers' ? JSON.stringify(scope) : key} section={section} data={data} selection={selection} setSelection={setSelection} memberScope={key === 'customers' ? scope : undefined} onMemberScopeChange={setScope} edit={() => {}} archive={() => {}} pending={false} loading={false} pagination={{ page: 1, pageSize: 100, total: key === 'questions' ? 85 : key === 'customers' ? 200 : 1 }} setPage={() => {}} exportCsv={() => {}} send={async () => ({})}/>}
      <output aria-label="합성 검색 조건">{JSON.stringify(scope)}</output>
      <output aria-label="합성 저장 요청">{JSON.stringify(saved)}</output>
    </AdminShell>
  </main>;
}
