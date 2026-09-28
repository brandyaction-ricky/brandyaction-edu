import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasLearningAccess } from '@/lib/platform-rules';
import type { Row } from '@/lib/platform';

export type MemberView = 'dashboard' | 'classes' | 'missions' | 'questions' | 'orders' | 'coupons' | 'resources' | 'profile' | 'messages' | 'reviews' | 'learn' | 'order-result';
export const MEMBER_ROW_LIMIT = 200;
const enrollmentViews = new Set<MemberView>(['dashboard', 'classes', 'missions', 'resources', 'reviews', 'learn']);
const learningViews = new Set<MemberView>(['dashboard', 'classes', 'missions', 'resources', 'learn']);
const missionViews = new Set<MemberView>(['dashboard', 'missions', 'learn']);
const scheduleViews = new Set<MemberView>(['dashboard', 'classes', 'learn']);

function checked(result: { data: unknown; error: { message: string } | null }, table: string): Row[] {
  if (result.error) throw new Error(result.error.message);
  const rows = (result.data || []) as Row[];
  if (rows.length > MEMBER_ROW_LIMIT) throw new Error(`${table} 자료가 한 화면의 조회 한도를 초과했습니다. 지원팀에 문의해 주세요.`);
  return rows;
}

export async function readMemberPlatformData(userId: string, view: MemberView, enrollmentId = '', lessonId = ''): Promise<Record<string, Row[]>> {
  const db = await createClient();
  const admin = createAdminClient();
  const data: Record<string, Row[]> = {};
  const limit = MEMBER_ROW_LIMIT + 1;
  if (view === 'profile' || view === 'messages') return data;
  const readQuestions = async () => checked(await db.from('edu_questions').select('id,user_id,course_id,learning_context,title,content,answer,status,created_at').eq('user_id', userId).eq('is_archived', false).order('created_at', { ascending: false }).limit(limit), '질문');
  const readCoupons = async () => checked(await db.from('customer_coupons').select('id,user_id,coupon_id,status,issued_at,used_at,expires_at,coupon:coupons(name,code,discount_type,discount_value,ends_at)').eq('user_id', userId).order('issued_at', { ascending: false }).limit(limit), '쿠폰');
  if (enrollmentViews.has(view)) {
    let query = db.from('enrollments').select('id,user_id,course_id,cohort_id,status,access_starts_at,access_ends_at,revoked_at,created_at').eq('user_id', userId);
    if (view === 'learn') query = query.eq('id', enrollmentId);
    if (view === 'dashboard') {
      // These three owner-scoped reads are independent. Starting them together
      // removes two network round trips from every dashboard navigation.
      const [enrollments, questions, coupons] = await Promise.all([
        query.order('created_at', { ascending: false }).limit(limit),
        readQuestions(),
        readCoupons(),
      ]);
      data.enrollments = checked(enrollments, '수강권');
      data.edu_questions = questions;
      data.customer_coupons = coupons;
    } else {
      data.enrollments = checked(await query.order('created_at', { ascending: false }).limit(limit), '수강권');
    }
    if (view === 'learn' && !data.enrollments.some(enrollment => hasLearningAccess(enrollment))) return { enrollments: [] };
  }
  if (view === 'questions') data.edu_questions = await readQuestions();
  if (view === 'coupons') data.customer_coupons = await readCoupons();
  if (view === 'orders' || view === 'order-result') {
    data.orders = checked(await db.from('orders').select('id,order_number,user_id,status,subtotal,discount_amount,total_amount,customer_name,customer_email,customer_phone,paid_at,cancelled_at,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit), '주문');
    const orderIds = data.orders.map(order => order.id);
    if (orderIds.length) {
      const [items, payments] = await Promise.all([
        db.from('order_items').select('id,order_id,course_id,cohort_id,item_name,unit_price,quantity').in('order_id', orderIds).limit(limit),
        db.from('payments').select('id,order_id,method,status,approved_amount,cancelled_amount,receipt_url,approved_at').in('order_id', orderIds).limit(limit),
      ]);
      data.order_items = checked(items, '주문 상품');
      data.payments = checked(payments, '결제');
    }
  }
  if (view === 'reviews') {
    data.my_reviews = checked(await db.from('reviews').select('id,course_id,user_id,status,rating,body,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit), '후기');
  }
  const courseIds = [...new Set([
    ...(data.enrollments || []).filter(enrollment => view !== 'resources' || hasLearningAccess(enrollment)).map(enrollment => String(enrollment.course_id)),
    ...(data.order_items || []).map(item => String(item.course_id)),
    ...(data.my_reviews || []).map(review => String(review.course_id)),
  ])];
  const cohortIds = [...new Set((data.enrollments || []).filter(enrollment => view !== 'resources' || hasLearningAccess(enrollment)).map(enrollment => String(enrollment.cohort_id)))];
  const active = (data.enrollments || []).filter(enrollment => hasLearningAccess(enrollment));
  const activeIds = active.map(enrollment => enrollment.id);
  // Once enrollments are known, these reads have no dependencies on each other.
  const [courses, cohorts, weeks, progress, submissions, drafts, sessions] = await Promise.all([
    courseIds.length ? (async () => {
      const columns = view === 'resources'
        ? 'id,title,slug,category,list_price,schedule_label,duration_label,resources:metadata->product_resources,digital_sections:metadata->digital_content_sections'
        : 'id,title,slug,category,list_price,schedule_label,duration_label';
      return checked(await admin.from('courses').select(columns).in('id', courseIds).limit(limit), '상품');
    })() : null,
    cohortIds.length && learningViews.has(view) ? (async () => checked(await admin.from('cohorts').select('id,course_id,name,status,operation_start_at,operation_end_at').in('id', cohortIds).limit(limit), '기수'))() : null,
    courseIds.length && learningViews.has(view) ? (async () => checked(await admin.from('curriculum_weeks').select('id,course_id,week_number,title,goal,is_published,display_order').in('course_id', courseIds).eq('is_published', true).order('week_number').limit(limit), '커리큘럼 주차'))() : null,
    activeIds.length && (view === 'dashboard' || view === 'classes' || view === 'learn') ? (async () => checked(await db.from('lesson_progress').select('id,enrollment_id,lesson_id,completed_at,updated_at').in('enrollment_id', activeIds).limit(limit), '학습 진도'))() : null,
    activeIds.length && missionViews.has(view) ? (async () => checked(await db.from('mission_submissions').select('id,enrollment_id,mission_id,attempt_number,status,response,submitted_at,reviewed_at,reviewer_feedback').in('enrollment_id', activeIds).limit(limit), '미션 제출'))() : null,
    activeIds.length && view === 'learn' ? (async () => checked(await db.from('edu_mission_drafts').select('id,enrollment_id,mission_id,content,url,updated_at').eq('user_id', userId).in('enrollment_id', activeIds).limit(limit), '미션 초안'))() : null,
    active.length && scheduleViews.has(view) ? (async () => checked(await admin.from('cohort_sessions').select('id,cohort_id,session_number,title,description,scheduled_at,is_public').in('cohort_id', active.map(enrollment => enrollment.cohort_id)).eq('is_public', true).order('session_number').limit(limit), '일정'))() : null,
  ]);
  if (courses) data.courses = view === 'resources' ? courses.map(course => {
    const { resources, digital_sections, ...rest } = course;
    return { ...rest, metadata: { product_resources: resources || [], digital_content_sections: digital_sections || [] } };
  }) : courses;
  if (cohorts) data.cohorts = cohorts;
  if (weeks) data.curriculum_weeks = weeks;
  if (progress) data.lesson_progress = progress;
  if (submissions) data.mission_submissions = submissions;
  if (drafts) data.edu_mission_drafts = drafts;
  if (sessions) data.cohort_sessions = sessions;
  const weekIds = (weeks || []).map(week => week.id);
  const sessionIds = (sessions || []).map(session => session.id);
  const [lessons, sessionContents] = await Promise.all([
    weekIds.length ? (async () => checked(await admin.from('curriculum_lessons').select('id,week_id,day_number,title,description,content_type,duration_label,is_preview,is_published,display_order').in('week_id', weekIds).eq('is_published', true).order('display_order').limit(limit), '학습'))() : null,
    sessionIds.length ? (async () => checked(await db.from('cohort_session_contents').select('session_id,live_url,replay_url').in('session_id', sessionIds).limit(limit), '라이브 주소'))() : null,
  ]);
  if (lessons) data.curriculum_lessons = lessons;
  if (sessionContents) data.cohort_session_contents = sessionContents;
  if (activeIds.length && missionViews.has(view)) {
    const lessonIds = (lessons || []).map(lesson => lesson.id);
    if (lessonIds.length) data.curriculum_missions = checked(await db.from('curriculum_missions').select('id,lesson_id,title,instructions,submission_type,is_required,is_published').in('lesson_id', lessonIds).eq('is_published', true).limit(limit), '미션');
  }
  if (active.length && (view === 'resources' || view === 'learn')) {
    const lessonIds = (data.curriculum_lessons || []).map(lesson => lesson.id);
    const scoped = view === 'learn' && lessonId ? lessonIds.filter(id => id === lessonId) : lessonIds;
    if (scoped.length) data.lesson_contents = checked(await db.from('lesson_contents').select('lesson_id,vod_url,resource_name,resource_storage_path,body_text,external_url').in('lesson_id', scoped).limit(limit), '학습 자료');
  }
  return data;
}
