import { NextResponse } from 'next/server';
import { createClient, type ServerCookieMutation } from '@/lib/supabase/server';
import { safeNext } from '@/lib/platform';
import { afterEmailLogin } from '@/lib/email-auth';

// Supports token-hash email templates, including opening email on a new device.
export async function GET(request: Request) {
  const url = new URL(request.url), hash = url.searchParams.get('token_hash'), type = url.searchParams.get('type');
  const emailChange = url.searchParams.get('flow') === 'email_change' || type === 'email_change';
  let destination = emailChange ? '/auth/email-change-help' : '/login?error=email_confirmation';
  let authenticated = false;
  const cookies: ServerCookieMutation[] = [];
  if (hash && hash.length <= 512 && (type === 'email' || type === 'signup' || type === 'recovery' || type === 'email_change')) {
    try {
      const { data, error } = await (await createClient(nextCookies => cookies.push(...nextCookies))).auth.verifyOtp({ token_hash: hash, type });
      if (!error && type === 'email_change' && !data.session) {
        // Secure Email Change accepts the first address without creating a
        // session. The other address still needs confirmation.
        destination = '/auth/email-change-help?status=pending';
      } else if (!error && data.user) {
        authenticated = true;
        destination = type === 'recovery' ? '/auth/reset-password' : afterEmailLogin(data.user.user_metadata, safeNext(url.searchParams.get('next')));
      }
    } catch { /* Expired or invalid links return to login without exposing tokens. */ }
  } else if (emailChange && url.searchParams.get('code')) {
    // Existing Supabase ConfirmationURL templates return a PKCE code. This
    // succeeds in the requesting browser; another browser has no verifier.
    try {
      const auth = (await createClient(nextCookies => cookies.push(...nextCookies))).auth;
      const { error } = await auth.exchangeCodeForSession(url.searchParams.get('code')!);
      if (!error) {
        const { data } = await auth.getUser();
        if (data.user) {
          authenticated = true;
          destination = afterEmailLogin(data.user.user_metadata, safeNext(url.searchParams.get('next')));
        }
      }
    } catch { /* Guide the member back to the original account. */ }
  }
  const response = NextResponse.redirect(new URL(destination, url.origin));
  if (authenticated) cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
