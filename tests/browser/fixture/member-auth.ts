// No real Supabase configuration or credentials are used by browser fixtures.
export function createClient() {
  return { storage: { from: (bucket: string) => ({ uploadToSignedUrl: async (path: string, token: string, file: File, options: { contentType: string }) => {
    const response = await fetch('/synthetic-storage/upload?path=' + encodeURIComponent(path), { method: 'PUT', body: file, headers: { 'Content-Type': options.contentType, 'X-Fixture-Bucket': bucket } });
    return response.ok ? { data: { path }, error: null } : { error: { message: '합성 파일 전송 실패' } };
  } }) }, auth: {
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
