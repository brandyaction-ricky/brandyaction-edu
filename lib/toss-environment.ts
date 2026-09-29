export type TossCredentialMode = 'test' | 'live' | 'unknown' | 'missing';
export type TossMode = TossCredentialMode | 'mismatch';

type TossEnvironment = Readonly<Record<string, string | undefined>>;

export function tossCredentialMode(value: string | undefined): TossCredentialMode {
  if (!value) return 'missing';
  if (value.startsWith('test_')) return 'test';
  if (value.startsWith('live_')) return 'live';
  return 'unknown';
}

export function tossMode(clientKey: string | undefined, secretKey: string | undefined): TossMode {
  const clientMode = tossCredentialMode(clientKey);
  const secretMode = tossCredentialMode(secretKey);
  if (clientMode === 'missing' || secretMode === 'missing') return 'missing';
  return clientMode === secretMode ? clientMode : 'mismatch';
}

export function refundReadiness(env: TossEnvironment) {
  const secret = env.TOSS_SECRET_KEY || env.PG_SECRET_KEY;
  const mode = tossMode(env.NEXT_PUBLIC_TOSS_CLIENT_KEY, secret);
  const test = mode === 'test' && env.NEXT_PUBLIC_APP_ENV !== 'production';
  const live = mode === 'live'
    && env.NEXT_PUBLIC_APP_ENV === 'production'
    && env.VERCEL_ENV === 'production'
    && env.EDU_ALLOW_LIVE_REFUNDS === 'true';
  return { enabled: test || live, mode, secret };
}
