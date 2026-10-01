// No real Supabase configuration or credentials are used by browser fixtures.
export function createClient() {
  return { auth: {
    getSession: async () => {
      const response = await fetch('/synthetic-auth/session');
      return response.ok ? { data: { session: null }, error: null } : { error: { message: 'Synthetic session unavailable' } };
    },
    signOut: async () => ({ error: null }),
  } };
}
