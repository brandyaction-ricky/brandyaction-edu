import { cohortFeedWorkerRoute } from '@/lib/edu-tips-source-server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export function GET(request: Request) { return cohortFeedWorkerRoute(request); }
export function HEAD() { return new Response(null, { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } }); }
