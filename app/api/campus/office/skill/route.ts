import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {studentReportingAvailable} from '@/features/campus/office/student-reporting';
import {uuid} from '@/features/campus/webinar/domain';
import {createClient} from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const headers = {'Cache-Control': 'private, no-store'};
  const unavailable = () => new Response(null, {status: 404, headers});
  if (!studentReportingAvailable() || process.env.EDU_CAMPUS_OFFICE_ENABLED !== 'true' || process.env.EDU_CAMPUS_ENABLED !== 'true') return unavailable();

  const enrollmentId = new URL(request.url).searchParams.get('enrollmentId');
  if (!uuid(enrollmentId)) return unavailable();
  const db = await createClient();
  const {error} = await db.rpc('edu_campus_student_connection', {
    p_enrollment: enrollmentId, p_action: 'list', p_employee: null, p_code: null, p_id: null,
  });
  if (error) return unavailable();

  const environment = process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://qitqxizuwmmlhlcgsrqe.supabase.co' ? 'production' : 'development';
  const archive = await readFile(join(process.cwd(), 'skills/packages', `moonshot-campus-report-${environment}.zip`));
  return new Response(new Uint8Array(archive), {headers: {...headers, 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="moonshot-campus-report.zip"'}});
}
