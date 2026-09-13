const OAUTH_CODE_PATTERN = /^[A-Za-z0-9._~-]{16,2048}$/;

export function oauthCallbackRecoveryPath({
  pathname,
  code,
  cookieNames,
}: {
  pathname: string;
  code: string | null;
  cookieNames: string[];
}) {
  if (pathname !== "/" || !code || !OAUTH_CODE_PATTERN.test(code)) return null;

  const hasPkceVerifier = cookieNames.some((name) =>
    name.endsWith("-auth-token-code-verifier"),
  );
  if (!hasPkceVerifier) return null;

  const query = new URLSearchParams({ code, next: "/my" });
  return `/auth/callback?${query.toString()}`;
}
