// Only anonymous presentation/telemetry skip session refresh. All access checks remain protected.
export function isAnonymousWebinarRoute(path:string,method:string){
 return (method==='GET'&&/^\/api\/campus\/webinar\/[a-z0-9][a-z0-9-]{2,59}\/resources\/[-\w]{1,60}$/.test(path)) || (['GET','HEAD'].includes(method)&&/^\/campus\/live\/[a-z0-9][a-z0-9-]{2,59}\/?$/.test(path)) || (method==='POST'&&/^\/api\/campus\/webinar\/[a-z0-9][a-z0-9-]{2,59}\/events$/.test(path));
}
