import type { SupabaseClient } from '@supabase/supabase-js';
import { hasLearningAccess } from './platform-rules';
import { PRODUCT_REVIEW_PAGE_SIZE, reviewAuthor, type ReviewPage, type ReviewContext } from './product-reviews';
import type { Row } from './platform';

// Explicit public projection: no member, order, email or moderation metadata.
const publicColumns = 'id,rating,body,author_name,author_nickname,published_at';
export async function readPublishedProductReviews(db: SupabaseClient, courseId: string, page: number): Promise<ReviewPage> {
  const course = await db.from('courses').select('id').eq('id', courseId).eq('status', 'published').is('archived_at', null).maybeSingle();
  if (course.error) throw course.error;
  if (!course.data) throw Object.assign(new Error('클래스를 찾을 수 없습니다.'), { status: 404 });
  const list = await db.from('reviews').select(publicColumns).eq('course_id', courseId).eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false }).order('id').range((page - 1) * PRODUCT_REVIEW_PAGE_SIZE, page * PRODUCT_REVIEW_PAGE_SIZE - 1);
  if (list.error) throw list.error;
  // Read only ratings for the summary, including reviews beyond the first page.
  // Paginate rather than silently computing an average from the API's row cap.
  let count = 0, sum = 0;
  for (let offset = 0; ; offset += 1000) {
    const result = await db.from('reviews').select('rating').eq('course_id', courseId).eq('status', 'published').order('id').range(offset, offset + 999);
    if (result.error) throw result.error;
    const ratings = result.data || [];
    for (const review of ratings) { count++; sum += Number(review.rating); }
    if (ratings.length < 1000) break;
  }
  return { rows: (list.data || []).map((review: Row) => ({ id: review.id, rating: review.rating, body: review.body, author: reviewAuthor(review), published_at: review.published_at })),
    summary: { count, average: count ? sum / count : null }, page, hasMore: page * PRODUCT_REVIEW_PAGE_SIZE < count };
}

export async function readProductReviewContext(db: SupabaseClient, userId: string, courseId: string): Promise<ReviewContext> {
  const [enrollments, review] = await Promise.all([
    db.from('enrollments').select('id,status,access_starts_at,access_ends_at,revoked_at').eq('user_id', userId).eq('course_id', courseId).eq('status', 'active').order('created_at', { ascending: false }),
    db.from('reviews').select('id,rating,body,status').eq('user_id', userId).eq('course_id', courseId).maybeSingle(),
  ]);
  if (enrollments.error) throw enrollments.error;
  if (review.error) throw review.error;
  return { enrollmentId: enrollments.data?.find(enrollment => hasLearningAccess(enrollment))?.id || null, review: review.data };
}
