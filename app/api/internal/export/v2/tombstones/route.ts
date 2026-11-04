import { erasureRoute } from '@/lib/edu-tips-erasure-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) { return erasureRoute(request, 'page'); }
