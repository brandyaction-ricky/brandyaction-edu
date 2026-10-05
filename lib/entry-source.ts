export const ENTRY_SOURCES = ['paid', 'organic', 'alumni', 'youtube'] as const;

export type EntrySource = (typeof ENTRY_SOURCES)[number];

export function parseEntrySource(value: unknown): EntrySource | null {
  return typeof value === 'string' && ENTRY_SOURCES.some(source => source === value)
    ? value as EntrySource
    : null;
}

export function withEntrySource(href: string, source: EntrySource | null): string {
  if (!source || !href) return href;
  try {
    const url = new URL(href, 'https://brandyaction-edu.com');
    const relative = href.startsWith('/') && !href.startsWith('//');
    if (!relative && !['brandyaction-edu.com', 'www.brandyaction-edu.com', 'brandyaction-edu-dev.vercel.app'].includes(url.hostname)) return href;
    if (url.username || url.password || url.port || (!relative && url.protocol !== 'https:')) return href;
    if (!['/checkout', '/apply'].includes(url.pathname) && !/^\/classes\/[a-zA-Z0-9_-]+$/.test(url.pathname)) return href;
    url.searchParams.set('src', source);
    return relative ? `${url.pathname}${url.search}${url.hash}` : url.href;
  } catch {
    return href;
  }
}

// Recruitment SMS follows the recorded room, never an email/name match.
// Missing room evidence stays unknown even when a generic template has src=paid.
export function recruitmentMessageLinks(content: string, channel: unknown): string {
  const source = channel === 'paid' || channel === 'organic' ? channel : null;
  return content.replace(/https?:\/\/[^\s<>"']+/g, token => {
    const suffix = token.match(/[\])}.,!?]+$/)?.[0] || '';
    const href = suffix ? token.slice(0, -suffix.length) : token;
    try {
      const url = new URL(href);
      if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !['brandyaction-edu.com', 'www.brandyaction-edu.com', 'brandyaction-edu-dev.vercel.app'].includes(url.hostname)) return token;
      const broadcast = url.pathname.match(/^(\/go\/[0-9a-f-]{36}\/(?:first|encore)\/)(?:paid|organic|unknown)(\/(?:live|offer))$/i);
      if (broadcast) url.pathname = broadcast[1] + (source || 'unknown') + broadcast[2];
      else if (['/checkout', '/apply'].includes(url.pathname) || /^\/classes\/[a-zA-Z0-9_-]+$/.test(url.pathname)) {
        if (source) url.searchParams.set('src', source);
        else url.searchParams.delete('src');
      } else return token;
      return url.href + suffix;
    } catch { return token; }
  });
}

export function loginBeforeCheckout(href: string, signedIn: boolean): string {
  if (signedIn || !href.startsWith('/') || href.startsWith('//')) return href;
  try {
    const url = new URL(href, 'https://brandyaction-edu.com');
    if (!['/checkout', '/apply'].includes(url.pathname)) return href;
    return '/login?next=' + encodeURIComponent(`${url.pathname}${url.search}${url.hash}`);
  } catch {
    return href;
  }
}
