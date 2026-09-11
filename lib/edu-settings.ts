import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
export const getEduSettings = cache(async () => {
  try {
    const {data,error}=await createAdminClient().from('site_settings').select('key,value').in('key',['edu_seo','edu_operations']);
    if(error) throw error;
    return { seo: (data?.find(r=>r.key==='edu_seo')?.value||{}) as Record<string,unknown>, operations: (data?.find(r=>r.key==='edu_operations')?.value||{}) as Record<string,unknown> };
  } catch { return {seo:{} as Record<string,unknown>,operations:{} as Record<string,unknown>}; }
});
