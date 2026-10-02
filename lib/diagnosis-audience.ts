/** Verified profile role only. Student rollout requires an explicit server opt-in. */
export function diagnosisAudienceAllows(user: { role?: string }, env = process.env) {
  return env.EDU_MYIN_DIAGNOSIS_ADMIN_ONLY === 'false' || user.role === 'admin';
}
