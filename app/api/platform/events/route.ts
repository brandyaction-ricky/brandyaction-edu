import { createAdminClient } from '@/lib/supabase/admin';
import { isTestRequest } from '@/lib/landing';
import { uuid } from '@/lib/edu-workflows';
const permitted = /^\/(?:$|classes(?:\/[a-zA-Z0-9_-]+)?$|articles(?:\/[a-zA-Z0-9_-]+)?$|stories$|checkout$|apply$)/;
export async function POST(request:Request) {
  if(request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403});
  if(isTestRequest(request.headers.get('cookie')))return new Response(null,{status:204});
  try {
    const raw=await request.text();if(raw.length>4096)return new Response(null,{status:413});
    const body=JSON.parse(raw);
    if(!uuid(body.session)||typeof body.path!=='string'||!permitted.test(body.path)||!['page_view','class_view','article_view','checkout_view','application_click','article_click','click'].includes(body.event))return new Response(null,{status:400});
    const metadata:Record<string,string>={};
    for(const key of ['source','medium','campaign'])if(typeof body.metadata?.[key]==='string')metadata[key]=body.metadata[key].slice(0,100);
    const target=typeof body.target==='string'&&permitted.test(body.target)?body.target:null;
    const {error}=await createAdminClient().rpc('edu_record_event',{p_session:body.session,p_user:null,p_event:body.event,p_path:body.path,p_target:target,p_metadata:metadata});
    return new Response(null,{status:error?503:204});
  } catch{return new Response(null,{status:400});}
}
