import type { Row } from './platform';

export const PRODUCT_REVIEW_PAGE_SIZE = 10;
export function reviewAuthor(review: Row) {
  const name = String(review.author_nickname || review.author_name || '').trim();
  return name ? [...name][0] + '**' : '수강생';
}
export type ReviewSummary = { count: number; average: number | null };
export type ReviewPage = { rows: Row[]; summary: ReviewSummary; page: number; hasMore: boolean };
export type ReviewContext = { enrollmentId: string | null; review: Row | null };
