const destinations = new Set(['/my/messages', '/my/questions', '/my/missions', '/admin/questions', '/admin/reviews', '/admin/reviews?tab=blocks', '/admin/reviews?tab=missions']);
export function learningNoticePath(value: unknown): string | null {
  return typeof value === 'string' && (destinations.has(value) || /^\/my\/questions\?question=[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value) || /^\/learn\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)) ? value : null;
}
