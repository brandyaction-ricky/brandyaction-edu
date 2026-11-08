const OAUTH_CODE_PATTERN = /^[A-Za-z0-9._~-]{16,2048}$/;

export const campusReturnCookie = 'edu-campus-login-return';

const campusAdminPages = ['/admin/campus', '/admin/campus/webinars'] as const;
export type CampusAdminPage = typeof campusAdminPages[number];

export function isCampusAdminPage(path: string): path is CampusAdminPage {
  return campusAdminPages.some(page => page === path);
}

// Accept only destinations with a matching server-side menu permission check.
export function campusLoginReturn(value?: string | null) {
  if (!value || value.length > 1600) return null;
  const separator = value.indexOf('?');
  const path = separator < 0 ? value : value.slice(0, separator);
  if (!isCampusAdminPage(path)) return null;
  const query = new URLSearchParams(separator < 0 ? '' : value.slice(separator + 1));
  return path + (query.size ? '?' + query : '');
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
