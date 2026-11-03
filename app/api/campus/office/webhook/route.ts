import { createAdminClient } from '@/lib/supabase/admin';
import { handleOfficeWebhook, readOfficeConnectors } from '@/features/campus/office/webhook';
import { ingestOfficeEvent } from '@/features/campus/office/repository';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function POST(request: Request) { return handleOfficeWebhook(request, { enabled: process.env.EDU_CAMPUS_ENABLED === 'true' && process.env.EDU_CAMPUS_OFFICE_ENABLED === 'true', connectors: readOfficeConnectors(process.env), ingest: verified => ingestOfficeEvent(createAdminClient(), verified) }); }
