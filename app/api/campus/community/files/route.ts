import { getAuthenticatedUser } from '@/lib/server-auth';
import { handlePortfolioFiles } from '@/features/campus/community/file-handler';
import { portfolioFilePorts } from '@/features/campus/community/file-server';
export const dynamic='force-dynamic';export const runtime='nodejs';
const handle=(req:Request)=>handlePortfolioFiles(req,{enabled:process.env.EDU_CAMPUS_ENABLED==='true'&&process.env.EDU_CAMPUS_COMMUNITY_ENABLED==='true',authenticate:getAuthenticatedUser,ports:portfolioFilePorts});
export const GET=handle;export const POST=handle;
