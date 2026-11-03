import { createAdminClient } from '@/lib/supabase/admin';
import { handleReviews } from '@/features/campus/business/review-handler';
import { publicReview } from '@/features/campus/business/reviews';
export const dynamic='force-dynamic';
// The service role can call only the two bounded token RPCs here. It is never returned to a browser.
export function POST(request:Request){return handleReviews(request,{enabled:process.env.EDU_CAMPUS_ENABLED==='true'&&process.env.EDU_CAMPUS_BUSINESS_ENABLED==='true',authenticate:async()=>null,load:async()=>null,create:async()=>null,revoke:async()=>null,publicRequest:async(d)=>publicReview(createAdminClient(),d)},true);}
