/** Verified profile role only. Student rollout requires an explicit server opt-in. */
export function diagnosisAudienceAllows(user: { role?: string }, env = process.env) {
  return env.EDU_MYIN_DIAGNOSIS_ADMIN_ONLY === 'false' || user.role === 'admin';
}

/** Publication is read on the server; a browser flag never grants a student access. */
export async function resolveDiagnosisAudience(user: { id: string; role?: string },
 rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{data: unknown; error: unknown}>) {
 if (user.role === 'admin') return true;
 const result = await rpc('edu_diagnosis_actor_allowed', {p_actor: user.id});
 if (result.error) throw Error('Diagnosis audience unavailable');
 return result.data === true;
}
