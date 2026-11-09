export const studentEnvironment = 'production';
export const studentEndpoint = 'https://qitqxizuwmmlhlcgsrqe.supabase.co/functions/v1/campus-student-report';

import {readFile} from 'node:fs/promises';

// The project anon key authenticates to the Supabase gateway. The separate
// per-device credential authorizes a specific learner, enrollment, and bot.
export async function gatewayHeaders() {
  const {key} = JSON.parse(await readFile(new URL('./gateway-public.json',import.meta.url),'utf8'));
  const claims = JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString('utf8'));
  if (claims.role !== 'anon' || claims.ref !== 'qitqxizuwmmlhlcgsrqe' || claims.sub || claims.exp <= Date.now()/1000) {
    throw new Error('Invalid public production gateway key');
  }
  return {Authorization:'Bearer '+key, apikey:key};
}
