import type { LivePhase } from './webinar-attendance';
export type BroadcastSession={phase:LivePhase;url:string|null;enabled:boolean;offerEnabled:boolean;revision:number};
export type BroadcastReport={sessions:BroadcastSession[];offerReady:boolean;counts:{phase:LivePhase;channel:string;target:string;requests:number}[]};
// Conservative filtering. This is a request count, never unique viewers or attendance.
export function recordBroadcastRequest(request:Request) {
 if(request.method!=='GET')return false;
 const purpose=[request.headers.get('purpose'),request.headers.get('sec-purpose'),request.headers.get('x-purpose')].join(' ');
 const ua=request.headers.get('user-agent')||'';
 if(!ua||/prefetch|prerender/i.test(purpose)||/bot|crawler|spider|preview|facebookexternalhit|kakaotalk-scrap|slackbot|curl|wget/i.test(ua))return false;
 const mode=request.headers.get('sec-fetch-mode');
 return !mode||mode==='navigate';
}
