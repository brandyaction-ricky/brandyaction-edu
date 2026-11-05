/** These entrypoints enforce identity and enrollment/ownership in their own handlers.
 * Keep discovery hidden during rollout, but let a shared entry link reach login.
 * Admin, QA, dispatch and unlisted endpoints remain behind the operator-only gate.
 */
const memberApis=new Set([
 '/api/campus','/api/campus/focus','/api/campus/journal','/api/campus/library',
 '/api/campus/office','/api/campus/office/agents','/api/campus/space',
 '/api/campus/community','/api/campus/community/exhibition','/api/campus/community/files',
 '/api/campus/community/rewards','/api/campus/community/workflows',
 '/api/campus/business','/api/campus/business/archive','/api/campus/business/cases',
 '/api/campus/business/cases/learning','/api/campus/business/reviews',
 '/api/campus/business/timeline','/api/campus/support',
]);
export function isMemberCampusRoute(path:string,method:string){
 if(['GET','HEAD'].includes(method)&&['/campus','/campus/enter','/campus/workspace'].includes(path))return true;
 if(method==='POST'&&path==='/api/campus/analytics')return true;
 return ['GET','POST'].includes(method)&&memberApis.has(path);
}
