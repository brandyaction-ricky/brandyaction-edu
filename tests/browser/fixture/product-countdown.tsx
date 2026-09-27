import { ProductDetail } from '../../../app/ui/final/public-views';
import '../../../app/ui/final/frontend.css';
import '../../../app/ui/final/product-countdown.css';

export function ProductCountdownFixture() {
  const params = new URLSearchParams(location.search);
  const course = { id: 'synthetic-course', slug: 'synthetic', title: '합성 모집 클래스', category: params.has('free') ? 'free' : params.has('digital') ? 'digital' : 'paid_class', status: 'published', list_price: params.has('free') ? 0 : 1000, duration_label: '4주', schedule_label: '매주', description: '합성 소개', metadata: {
    recruitment_countdown_enabled: !params.has('off'),
    detail_html_document: '<html><body><a href="#faq">자주 묻는 질문</a><a href="#pp">클래스 신청</a><button data-cta="apply">신청 버튼</button><script>document.body.innerHTML="위험 스크립트 실행"</script><p style="margin-top:600px" id="faq">자주 묻는 질문 내용</p></body></html>',
    ...(params.has('custom') ? { cta_url: '/safe-custom', cta_label: '외부 신청' } : {}),
  } };
  const cohorts = ['a', 'b'].slice(0, params.has('multiple') ? 2 : 1).map((key, index) => ({ id: `cohort-${key}`, course_id: course.id, name: `합성 ${index + 1}기`, status: params.has('closed') ? 'closed' : 'upcoming', price: params.has('zero') ? 0 : 1000, recruitment_end_at: params.has('missing') ? null : index === 1 ? '2099-10-03T14:59:00Z' : params.get('end') || '2099-10-01T14:59:00Z' }));
  const data = { courses: [course], cohorts, curriculum_weeks: params.has('unready') ? [] : [{ id: 'week', course_id: course.id, is_published: true }], curriculum_lessons: [{ id: 'lesson', week_id: 'week', is_published: true }], enrollments: params.has('enrolled') ? [{ id: 'enrolled-fixture', course_id: course.id, status: 'active' }] : [] };
  return <div className="edu-front"><ProductDetail course={course} data={data} /></div>;
}
