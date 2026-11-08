const OAUTH_CODE_PATTERN = /^[A-Za-z0-9._~-]{16,2048}$/;

export const campusReturnCookie = 'edu-campus-login-return';

// Only campus pages participate in the Site URL fallback. Parse and rebuild the
// query so a stored value can never select a different host or auth endpoint.
export function campusLoginReturn(value?: string | null) {
  if (!value || value.length > 1600) return null;
  const [path, query] = value.split('?');
  if (!/^\/(?:campus\/(?:workspace|operator|enter)|admin\/campus\/(?:preview|webinars|study))$/.test(path)) return null;
  const params = new URLSearchParams(query);
  return path + (params.size ? '?' + params : '');
}

export function oauthCallbackRecoveryPath({
  pathname,
  code,
  cookieNames,
  campusReturn,
}: {
  pathname: string;
  code: string | null;
  cookieNames: string[];
  campusReturn?: string;
}) {
  if (pathname !== "/" || !code || !OAUTH_CODE_PATTERN.test(code)) return null;

  const hasPkceVerifier = cookieNames.some((name) =>
    name.endsWith("-auth-token-code-verifier"),
  );
  if (!hasPkceVerifier) return null;

  const query = new URLSearchParams({ code, next: campusLoginReturn(campusReturn) || "/my" });
  return `/auth/callback?${query.toString()}`;
}
