import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type TossCredentialMode = 'test' | 'live' | 'unknown' | 'missing';
type TossMode = TossCredentialMode | 'mismatch';

function tossCredentialMode(value: string | undefined): TossCredentialMode {
  if (!value) return 'missing';
  if (value.startsWith('test_')) return 'test';
  if (value.startsWith('live_')) return 'live';
  return 'unknown';
}

function tossMode(clientKey: string | undefined, secretKey: string | undefined): TossMode {
  const clientMode = tossCredentialMode(clientKey);
  const secretMode = tossCredentialMode(secretKey);
  if (clientMode === 'missing' || secretMode === 'missing') return 'missing';
  return clientMode === secretMode ? clientMode : 'mismatch';
}

function supabaseProjectRef(url: string | undefined) {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith('.supabase.co') ? hostname.slice(0, -'.supabase.co'.length) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const appEnvironment = process.env.NEXT_PUBLIC_APP_ENV || 'unknown';
  const tossClientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  const tossSecretKey = process.env.TOSS_SECRET_KEY || process.env.PG_SECRET_KEY;
  const paymentMode = tossMode(tossClientKey, tossSecretKey);
  const supabaseRef = supabaseProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const configuration = {
    supabase: Boolean(supabaseRef && process.env.SUPABASE_SERVICE_ROLE_KEY),
    tossClient: Boolean(tossClientKey),
    tossSecret: Boolean(tossSecretKey),
    tossWebhook: Boolean(process.env.TOSS_WEBHOOK_TOKEN),
  };

  let databaseReachable = false;
  try {
    const db = createAdminClient();
    const { error } = await db.from('courses').select('id').limit(1);
    databaseReachable = !error;
  } catch {
    databaseReachable = false;
  }

  const safePaymentMode = appEnvironment === 'development'
    ? paymentMode === 'test'
    : !['missing', 'mismatch'].includes(paymentMode);
  const ok = Object.values(configuration).every(Boolean) && databaseReachable && safePaymentMode;

  return Response.json({
    ok,
    environment: appEnvironment,
    deployment: process.env.VERCEL_ENV || 'local',
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || null,
    services: {
      supabase: { configured: configuration.supabase, reachable: databaseReachable, projectRef: supabaseRef },
      toss: {
        clientConfigured: configuration.tossClient,
        secretConfigured: configuration.tossSecret,
        webhookConfigured: configuration.tossWebhook,
        mode: paymentMode,
      },
    },
  }, {
    status: ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
