import { erasureRoute } from '@/lib/edu-tips-erasure-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function POST(request: Request) { return erasureRoute(request, 'ack'); }
