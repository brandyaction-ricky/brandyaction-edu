export type HttpMetricRow={bucket_at:string;requests:number;client_errors:number;server_errors:number;slow_requests:number;total_ms:number;max_ms:number};
export function summarizeHttpMetrics(rows:HttpMetricRow[]){
 const value=rows.reduce((s,r)=>({requests:s.requests+Number(r.requests),clientErrors:s.clientErrors+Number(r.client_errors),serverErrors:s.serverErrors+Number(r.server_errors),slow:s.slow+Number(r.slow_requests),totalMs:s.totalMs+Number(r.total_ms),maxMs:Math.max(s.maxMs,Number(r.max_ms))}),{requests:0,clientErrors:0,serverErrors:0,slow:0,totalMs:0,maxMs:0});
 return {...value,averageMs:value.requests?value.totalMs/value.requests:null};
}
export async function observeSpaceOperation<T>(run:()=>Promise<T>,schedule:(status:number,elapsed:number)=>void){const start=performance.now();let status=200;try{return await run();}catch(e){status=e instanceof Error&&'status'in e&&[400,403,404,409,429].includes(Number(e.status))?Number(e.status):503;throw e;}finally{try{schedule(status,Math.min(120000,Math.max(0,Math.round(performance.now()-start))));}catch{/* Metrics must not change the operation result. */}}}
