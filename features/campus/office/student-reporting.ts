export function studentReportingAvailable() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (url === 'https://vjmjhaidlqkmascdjocw.supabase.co') {
    return process.env.NEXT_PUBLIC_APP_ENV === 'development';
  }
  return url === 'https://qitqxizuwmmlhlcgsrqe.supabase.co'
    && process.env.NEXT_PUBLIC_CAMPUS_STUDENT_REPORTING === 'true';
}
