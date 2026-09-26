export type PublicView = 'home' | 'classes' | 'class' | 'articles' | 'article' | 'stories' | 'checkout';

export const PUBLIC_PAGE_SIZE = 12;
export const PUBLIC_CACHE_SECONDS = 30;
export const PUBLIC_CACHE_TAG = 'edu-public-content';

// This is the public API contract, not an authorization rule. Member and
// operator reads remain request-scoped and are never put in the shared cache.
export const publicTables: Record<PublicView, readonly string[]> = {
  home: ['courses', 'cohorts', 'articles', 'review_videos', 'site_banners'],
  classes: ['courses', 'cohorts'],
  class: ['courses', 'cohorts', 'curriculum_weeks', 'curriculum_lessons', 'reviews', 'landing_configs'],
  articles: ['articles', 'article_categories', 'article_banner'],
  article: ['articles'],
  stories: ['review_videos'],
  checkout: ['courses', 'cohorts'],
};

export function publicViewForPath(path: string[]): PublicView | null {
  if (!path.length) return 'home';
  if (path[0] === 'classes') return path[1] ? 'class' : 'classes';
  if (path[0] === 'articles') return path[1] ? 'article' : 'articles';
  if (path[0] === 'stories') return 'stories';
  if (path[0] === 'checkout' || path[0] === 'apply') return 'checkout';
  return null;
}

export function publicReadParams(path: string[], search: URLSearchParams, page = 1, query = '', filter = '') {
  const view = publicViewForPath(path);
  if (!view) return null;
  const params = new URLSearchParams({ view });
  if (view === 'class' || view === 'article') params.set('slug', path[1]);
  if (view === 'checkout') params.set('cohort', search.get('cohort') || '');
  if (view === 'classes' || view === 'articles') {
    params.set('page', String(page));
    if (query.trim()) params.set('q', query.trim().slice(0, 80));
    if (filter && filter !== '전체') params.set('filter', filter);
  }
  return params;
}
