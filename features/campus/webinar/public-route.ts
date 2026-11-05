// Only anonymous presentation/telemetry skip session refresh. All access checks remain protected.
export function isAnonymousWebinarRoute(path:string,method:string){
 return (method==='GET'&&/^\/api\/campus\/webinar\/[a-z0-9][a-z0-9-]{2,59}\/resources\/[-\w]{1,60}$/.test(path)) || (['GET','HEAD'].includes(method)&&/^\/campus\/live\/[a-z0-9][a-z0-9-]{2,59}\/?$/.test(path)) || (method==='POST'&&/^\/api\/campus\/webinar\/[a-z0-9][a-z0-9-]{2,59}\/(?:events|activity)$/.test(path));
}
// Public presentation assets contain no accounts, enrollments or private documents.
export function isPublicWebinarAsset(path:string,method:string){
 if(!['GET','HEAD'].includes(method)||path.includes('..')||path.includes('%'))return false;
 return path==='/campus/world/tour/index.html'||path==='/campus/edu-bridge.mjs'||path==='/campus/showcase/learning-knowledge-full-v2.mp4'||/^\/campus\/world\/(?:[\w-]+\/)*[\w.-]+\.(?:m?js|css|glb|gltf|bin|m4a|woff2?)$/.test(path);
}
