import {getAuthenticatedUser} from '@/lib/server-auth';
import {canReviewCampus} from '@/features/campus/operator-access';

// One private capability check per page, never an enrollment or profile payload.
// The destination independently authorizes the operator again.
export async function GET(request:Request){
 const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
 if(request.headers.get('sec-fetch-site')==='cross-site')return Response.json({allowed:false},{status:403,headers});
 try{return Response.json({allowed:canReviewCampus(await getAuthenticatedUser())},{headers});}
 catch{return Response.json({allowed:false},{status:503,headers});}
}
