import type { CommunityRewards,CommunityState } from './domain';
// Synthetic cross-panel cache only. A page reload resets it; no member data is persisted.
const demoRewards = new Map<string, CommunityRewards>();
export function getCommunityDemoRewards(enrollmentId: string): CommunityRewards | null { return demoRewards.get(enrollmentId) ?? null; }
export function rememberCommunityDemoRewards(enrollmentId: string, rewards: CommunityRewards) { demoRewards.set(enrollmentId, rewards); }
export type CommunityOpenIntent={enrollmentId:string;tab:'demo_day'|'all';postId?:string;sessionId?:string};
let openIntent:CommunityOpenIntent|null=null;
export function requestCommunityOpen(intent:CommunityOpenIntent){openIntent={...intent};if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('campus:open-community'));}
export function consumeCommunityOpen(enrollmentId:string):CommunityOpenIntent|null{if(!openIntent||openIntent.enrollmentId!==enrollmentId)return null;const intent=openIntent;openIntent=null;return intent;}

// Demo records survive host tab changes only in memory; real server rows never use this cache.
const demoStates=new Map<string,CommunityState>();
const demoExhibitions=new Map<string,import('./exhibition').ExhibitionItem[]>();
export function getCommunityDemoState(enrollmentId:string,viewerId:string){return demoStates.get(`${viewerId}:${enrollmentId}`)??null;}
export function getCommunityDemoExhibition(enrollmentId:string){return demoExhibitions.get(enrollmentId)??[];}
export function rememberCommunityDemoState(enrollmentId:string,viewerId:string,state:CommunityState){
 demoStates.set(`${viewerId}:${enrollmentId}`,state);
 const held=new Set(state.reports.filter(r=>r.status==='open').map(r=>r.post_id));
 demoExhibitions.set(enrollmentId,state.posts.filter(p=>p.kind==='portfolio'&&p.visibility==='cohort'&&!p.hidden&&!held.has(p.id)&&!state.blockedIds.includes(p.owner_id)).slice(0,6).map(p=>({id:p.id,title:p.title,alias:p.alias,revision:p.revision,updatedAt:p.updated_at})));
}
