import { NextResponse } from 'next/server';
import { createClient, type ServerCookieMutation } from '@/lib/supabase/server';
import { safeNext } from '@/lib/platform';
import { afterEmailLogin } from '@/lib/email-auth';

// Supports token-hash email templates, including opening email on a new device.
export async function GET(request: Request) {
  const url = new URL(request.url), hash = url.searchParams.get('token_hash'), type = url.searchParams.get('type');
  let destination = '/login?error=email_confirmation';
  const cookies: ServerCookieMutation[] = [];
  if (hash && hash.length <= 512 && (type === 'email' || type === 'signup' || type === 'recovery' || type === 'email_change')) {
    try {
      const { data, error } = await (await createClient(nextCookies => cookies.push(...nextCookies))).auth.verifyOtp({ token_hash: hash, type });
      if (!error && data.user) destination = type === 'recovery' ? '/auth/reset-password' : afterEmailLogin(data.user.user_metadata, safeNext(url.searchParams.get('next')));
    } catch { /* Expired or invalid links return to login without exposing tokens. */ }
  }
  const response = NextResponse.redirect(new URL(destination, url.origin));
  if (destination !== '/login?error=email_confirmation') cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
