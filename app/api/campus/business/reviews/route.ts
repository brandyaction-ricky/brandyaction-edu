import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { handleReviews } from '@/features/campus/business/review-handler';
import { createReview,loadReviews,revokeReview } from '@/features/campus/business/reviews';
export const dynamic='force-dynamic';
function handle(request:Request){return handleReviews(request,{enabled:process.env.EDU_CAMPUS_ENABLED==='true'&&process.env.EDU_CAMPUS_BUSINESS_ENABLED==='true',authenticate:getAuthenticatedUser,load:async(v,e)=>loadReviews(await createClient(),v.id,e),create:async(v,d)=>createReview(await createClient(),v.id,d),revoke:async(v,d)=>revokeReview(await createClient(),v.id,d)});}
export const GET=handle;export const POST=handle;
