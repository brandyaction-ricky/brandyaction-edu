import { object, text, type Row } from './platform';
import { isRecruiting } from './platform-rules';

export const catalogTypes = { free: '무료 클래스', paid: '유료 클래스', digital: '디지털 상품' } as const;
export type CatalogType = keyof typeof catalogTypes;
export function catalogType(course: Row): CatalogType {
  return course.category === 'digital' || object(course, 'metadata').productType === 'digital'
    ? 'digital' : Number(course.list_price || 0) === 0 ? 'free' : 'paid';
}
export function catalogTitle(course: Row) {
  // An operational suffix is not a product identity. Keep the stored name,
  // slug, campaign and direct URL intact; do not infer duplicate products.
  return text(course, 'title').replace(/\s*\(오가닉\)\s*$/, '').trim();
}
const timestamp = (value: unknown) => value ? Date.parse(String(value)) : NaN;
const kstDay = (value: number) => Math.floor((value + 9 * 60 * 60 * 1000) / 86400000);

export function courseAvailability(course: Row, cohorts: Row[], now = Date.now()) {
  if (catalogType(course) === 'digital') return { state: 'available', label: '바로 이용', cohort: undefined };
  const own = cohorts.filter(row => row.course_id === course.id && !row.archived_at);
  const open = own.filter(row => isRecruiting(row, now)).sort((a, b) =>
    (timestamp(a.recruitment_end_at) || Infinity) - (timestamp(b.recruitment_end_at) || Infinity));
  if (open.length) {
    const end = timestamp(open[0].recruitment_end_at);
    const days = Number.isFinite(end) ? Math.max(0, kstDay(end) - kstDay(now)) : null;
    return { state: 'open', label: `모집 중${days === null ? '' : days === 0 ? ' · 오늘 마감' : ` · D-${days}`}`, cohort: open[0] };
  }
  const upcoming = own.find(row => ['upcoming', 'recruiting'].includes(String(row.status))
    && timestamp(row.recruitment_start_at) > now
    && (!row.recruitment_end_at || timestamp(row.recruitment_end_at) > timestamp(row.recruitment_start_at))
    && (!row.operation_end_at || timestamp(row.operation_end_at) > now));
  if (upcoming) return { state: 'upcoming', label: '모집 예정', cohort: upcoming };
  const ended = own.filter(row => ['recruiting', 'upcoming', 'closed', 'ongoing', 'completed'].includes(String(row.status))
    && (['closed', 'ongoing', 'completed'].includes(String(row.status))
      || timestamp(row.recruitment_end_at) <= now || timestamp(row.operation_end_at) <= now))
    .sort((a, b) => (timestamp(b.recruitment_end_at) || 0) - (timestamp(a.recruitment_end_at) || 0));
  if (ended.length) return { state: 'closed', label: '모집 마감', cohort: ended[0] };
  return { state: 'unknown', label: '일정 확인', cohort: undefined };
}

export function courseSchedule(course: Row, cohorts: Row[], now = Date.now()) {
  if (text(course, 'schedule_label').trim()) return text(course, 'schedule_label').trim();
  const availability = courseAvailability(course, cohorts, now);
  // Free live products also use operation_start_at for campaign operations.
  // It is not evidence of a live event time. Use an explicitly labeled
  // recruitment deadline until a real public schedule_label is supplied.
  const free = catalogType(course) === 'free';
  const value = timestamp(free ? availability.cohort?.recruitment_end_at : availability.cohort?.operation_start_at);
  if (!Number.isFinite(value)) return '';
  return `${free ? '모집 마감' : '과정 시작'} · ` + new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: false,
  }).format(new Date(value));
}

export function sortedCatalog(courses: Row[], cohorts: Row[], now = Date.now()) {
  const rank = (row: Row) => {
    const state = courseAvailability(row, cohorts, now).state;
    return state === 'open' || state === 'available' ? 0 : state === 'closed' ? 2 : 1;
  };
  return [...courses].sort((a, b) => rank(a) - rank(b));
}

export function catalogCounts(courses: Row[]) {
  const counts = { free: 0, paid: 0, digital: 0 };
  for (const course of courses) counts[catalogType(course)]++;
  return counts;
}
