export function homeConsultationEnabled(environment = process.env) {
  if (!environment.OPENAI_API_KEY?.trim()) return false;
  if (environment.VERCEL_ENV === 'preview') return true;
  return environment.VERCEL_ENV === 'production' && environment.EDU_HOME_CONSULTATION_ENABLED === 'true';
}
