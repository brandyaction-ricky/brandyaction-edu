import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
export const getEduSettings = cache(async () => {
  try {
    const {data,error}=await createAdminClient().from('site_settings').select('key,value').in('key',['edu_seo','edu_operations','support_email']);
    if(error) throw error;
    const operations = { ...((data?.find(r=>r.key==='edu_operations')?.value||{}) as Record<string,unknown>) };
    if (!Object.hasOwn(operations, 'supportEmail')) {
      const legacy = data?.find(r=>r.key==='support_email')?.value;
      operations.supportEmail = typeof legacy === 'string' ? legacy : '';
    }
    return { seo: (data?.find(r=>r.key==='edu_seo')?.value||{}) as Record<string,unknown>, operations };
  } catch { return {seo:{} as Record<string,unknown>,operations:{} as Record<string,unknown>}; }
});
