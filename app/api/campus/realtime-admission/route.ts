import {getAuthenticatedUser} from '@/lib/server-auth';
import {readWebinar} from '@/features/campus/webinar/server';
import {admitGateway} from '@/features/campus/webinar/realtime-admission';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
 return admitGateway(request,{env:process.env,user:getAuthenticatedUser,event:readWebinar});
}
