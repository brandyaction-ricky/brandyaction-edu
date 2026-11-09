// Search defaults (CEO 11-09): the name people type (브랜디에듀) and the two topics the site teaches.
export const EDU_SITE_NAME = '브랜디에듀';
export const EDU_SEO_DEFAULT = {
  title: '브랜디에듀 | AI 마케팅·AI 자동화 실전 교육',
  description: '브랜디에듀(BrandyAction EDU)는 AI 마케팅과 AI 자동화를 배워 내 사업과 업무에 바로 적용하는 실행 중심 교육입니다. 무료 클래스로 시작해 보세요.',
};
// The admin form used to prefill and save these; a saved copy of the old default is not a choice, so the new default wins.
const OLD_SEO_DEFAULT = { title: 'BrandyAction EDU | 배운 것을, 내 일의 성과로.', description: 'AI와 마케팅을 배우고 내 업무에 적용하는 실행 중심 교육.' };
export function seoText(seo: Record<string, unknown>, key: 'title' | 'description') {
  const value = String(seo[key] || '').trim();
  return value && value !== OLD_SEO_DEFAULT[key] ? value : EDU_SEO_DEFAULT[key];
}
