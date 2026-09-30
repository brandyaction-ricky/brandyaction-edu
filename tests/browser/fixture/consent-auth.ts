// This bundle has no Supabase client: every Auth operation is synthetic and local.
export function createClient() {
  return { auth: {
    updateUser: async (body: unknown) => {
      const response = await fetch('/synthetic-auth/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return response.ok ? { error: null } : { error: { message: 'Synthetic Auth error' } };
    },
    signOut: async () => { await fetch('/synthetic-auth/signout', { method: 'POST' }); return { error: null }; },
  } };
}
