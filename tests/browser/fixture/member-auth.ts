// No real Supabase configuration or credentials are used by browser fixtures.
export function createClient() {
  return { auth: {
    getSession: async () => {
      const response = await fetch('/synthetic-auth/session');
      return response.ok ? { data: { session: null }, error: null } : { error: { message: 'Synthetic session unavailable' } };
    },
    signOut: async (options?: { scope?: string }) => {
      await fetch('/synthetic-auth/signout', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(options || {})});
      return { error: null };
    },
  } };
}
