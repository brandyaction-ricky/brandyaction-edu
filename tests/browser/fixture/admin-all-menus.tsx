import { useState } from 'react';
import { AdminShell, AdminPageHeader } from '../../../features/admin-ui';
import { AdminCatalog } from '../../../app/ui/final/admin-catalog';
import { AdminWorkflows } from '../../../app/ui/admin-workflows';
import { AdminLearningCare } from '../../../app/ui/final/learning-care';
import { CurriculumEditor } from '../../../app/ui/final/curriculum-editor';
import { DiagnosisManagement } from '../../../app/ui/final/diagnosis-management';
import { Overview } from '../../../app/ui/final/admin-shell';
import { MarketingWorkspaceNav } from '../../../app/ui/marketing-workspace-nav';
import { ConversionReview } from '../../../app/ui/conversion-review';
import { sections, type Row } from '../../../lib/platform';
import { standaloneAdmin } from '../../../lib/admin-workflow-sections';

// Read-only visual review of actual components. No Auth, DB or outbound writes.
export function AdminAllMenusFixture() {
  const key = new URLSearchParams(location.search).get('menu') || 'overview';
  const section = sections.find(s => s.key === key);
  const [mobile, setMobile] = useState(false);
  const course = { id: 'synthetic-course', title: '합성 클래스 · 긴 제목의 실무 자동화 과정', category: 'paid_class', status: 'published', list_price: 10000 };
  const record = { id: 'synthetic-record', title: '검수 항목 · 긴 제목에서도 내용과 관리 버튼이 겹치지 않는지 확인합니다', name: '합성 검수 항목', code: 'QA-ONLY', discount_type: 'fixed', discount_value: 1000, product_scope: 'all', tag_kind: 'manual', rule_key: 'signed_up', is_active: true, status: 'published', is_published: true, content_type: 'column', reviewer_name: '합성 고객', created_at: '2026-11-01', course_id: course.id };
  const member = { id: 'member-0', full_name: '합성 운영자', email: 'qa@example.test', status: 'active', role: 'staff' };
  const data: Record<string, Row[]> = {
    ...(section ? { [section.table]: [record] } : {}),
    courses: [course], profiles: [member],
    cohorts: [{ id: 'synthetic-cohort', course_id: course.id, name: '합성 1기', status: 'active' }],
    curriculum_weeks: [{ id: 'synthetic-week', course_id: course.id, week_number: 1, title: '실행 시작' }],
    curriculum_lessons: [{ id: 'synthetic-lesson', week_id: 'synthetic-week', day_number: 1, title: '합성 학습', is_published: true }],
    curriculum_missions: [{ id: 'synthetic-mission', lesson_id: 'synthetic-lesson', title: '합성 미션 · 긴 제목과 안내를 모바일에서도 편하게 읽을 수 있는지 확인', submission_type: 'text' }],
    edu_questions: Array.from({ length: 3 }, (_, index) => ({ ...record, id: 'synthetic-question-' + index, title: index ? `${index + 1}번째 합성 질문 · 목록과 답변 영역의 구분 확인` : '학습 자료를 실행할 때 결과가 다르게 나옵니다', status: location.search.includes('answered') ? 'answered' : 'open', user_id: member.id, profiles: member, courses: course, learning_context: '합성 클래스 · 실무 자동화 과정 · 1주차 · 기본 도구 설정과 실행 결과 확인', content: '안내된 순서대로 자료를 실행했지만 마지막 단계의 결과가 다르게 나옵니다.\n설정에서 먼저 확인할 항목을 알려주세요. 실제 수강생 정보가 아닌 합성 질문입니다.' })),
    site_settings: [{ id: 'seo', key: 'edu_seo', value: { title: '합성 사이트 제목', description: '합성 사이트 설명' } }],
    admin_summary: [{ id: 'summary', pendingReviews: 2, openQuestions: 3, members: 100, activeEnrollments: 80, netRevenue: 1000000 }],
    crm_templates: [{ ...record, channel: 'lms', purpose: 'transactional', content: '합성 안내 문구' }],
    crm_campaigns: [], crm_automations: [],
    crm_delivery_state: [{ id: 'delivery', enabled: false, configured: false }],
    crm_sms_settings: [{ id: 'sms', canConfigure: false, senders: [], optouts: [] }],
  };
  const noWrite = async () => { throw new Error('읽기 전용 검수 화면입니다. 저장하지 않습니다.'); };
  return <main className="edu-admin adm adm-shell">
    <AdminShell current={key} available={sections} user={{ full_name: '합성 운영자', role: 'admin' }} mobile={mobile} setMobile={setMobile} logout={noWrite}>
      <p className="admin-audit-notice" role="note">UI 검수용 합성 데이터 · 실제 데이터 저장·발송 없음</p>
      {['conversion', 'landing', 'analytics', 'campaigns', 'templates', 'automations', 'seo', 'settings'].includes(key) && <MarketingWorkspaceNav current={key} available={sections} prefetchSection={() => {}} />}
      {!['overview', 'learning-care', 'learning', 'diagnosis-management', 'landing'].includes(key) && <AdminPageHeader title={section?.title || key} description="기존 정보와 기능을 유지하면서 공통 스타일과 반응형 배치를 확인합니다." />}
      {key === 'overview' ? <Overview data={data} available={sections}/>
        : key === 'learning-care' ? <AdminLearningCare messagesEnabled={false}/>
        : key === 'learning' ? <CurriculumEditor data={data} pending={false} send={noWrite} actorId="synthetic-reviewer" initialCourseId={course.id}/>
        : key === 'diagnosis-management' ? <DiagnosisManagement/>
        : key === 'conversion' ? <ConversionReview workspace initialView="recruitment" userId="synthetic-reviewer"/>
        : standaloneAdmin.includes(key) ? <AdminWorkflows section={key} data={data} pending={false} send={noWrite}/>
        : section && <AdminCatalog section={section} data={data} selection={[]} setSelection={() => {}} edit={() => {}} archive={() => {}} pending={false} loading={false} pagination={{page:1,pageSize:20,total:1}} setPage={() => {}} exportCsv={() => {}} send={noWrite}/>}
    </AdminShell>
  </main>;
}
