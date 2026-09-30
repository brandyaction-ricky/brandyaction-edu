import { getPublicAppBranding } from '@/lib/app-branding-server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const value = await getPublicAppBranding(), icon = new URL(request.url).searchParams.get('icon');
  const headers = { 'Cache-Control': 'public, max-age=0, must-revalidate' };
  if (icon === '192') return new Response(null, { status: 307, headers: { ...headers, Location: value.icon } });
  return Response.json(value, { headers });
}
