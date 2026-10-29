import { object, type Row } from './platform';
export function contentVisibility(data: Record<string, Row[]>) {
  const setting = object(data.article_banner?.[0], 'value') || {};
  return { lectures: setting.enabled !== false, articles: setting.articlesEnabled !== false };
}

export function articleDiscoveryVisible(data: Record<string, Row[]>) {
  const setting = object(data.article_banner?.[0], 'value') || {};
  return contentVisibility(data).articles && Number(setting.articleCount ?? data.articles?.length ?? 0) > 0;
}
