export function externalPartnerUrl(accessId?: string, lessonId?: string) {
  const query = new URLSearchParams();
  if (accessId) query.set('access', accessId);
  if (lessonId) query.set('lesson', lessonId);
  return '/my/partner-access' + (query.size ? '?' + query : '');
}
