export type AvatarAppearance={model:number;hairColor:string;skinColor:string;pantsColor:string;heldItem:'none'|'coffee'|'book'};
export function avatarAppearance(value:unknown):AvatarAppearance {
 const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const color=(key:string,fallback:string)=>typeof v[key]==='string'&&/^#[0-9a-f]{6}$/i.test(v[key] as string)?(v[key] as string).toLowerCase():fallback;
 return {model:Number.isInteger(v.model)&&Number(v.model)>=0&&Number(v.model)<=5?Number(v.model):v.gender==='female'?1:0,hairColor:color('hairColor','#302825'),skinColor:color('skinColor','#e8b68b'),pantsColor:color('pantsColor','#36485d'),heldItem:v.heldItem==='coffee'||v.heldItem==='book'?v.heldItem:'none'};
}
export function publicAvatar(value:unknown){const p=profile(value);return {nickname:p.nickname,gender:p.gender,coat:p.coat,...avatarAppearance(p)};}
export const SPACE_STATUSES = ['quiet', 'joinable', 'help', 'working'] as const;
export type SpaceStatus = typeof SPACE_STATUSES[number];
export type SpaceProfile = AvatarAppearance & { nickname: string; gender: 'male' | 'female'; coat: string; status: SpaceStatus; lowMotion: boolean; photoOptIn: boolean; note: string; desk: string; accessory:'none'|'glasses'|'headset'; deskTheme:'orbital'|'night'|'garden' };
export type SpacePeer = Partial<AvatarAppearance> & { userId: string; sessionId: string; nickname: string; gender: 'male' | 'female'; coat: string; status: SpaceStatus; photoOptIn: boolean; focusUntil: string | null; focusMode: number; expiresAt: string; x: number; y: number; sitting: boolean; wave?: boolean; accessory?:SpaceProfile['accessory'] };
export type SpaceChat = { id: string; userId: string; nickname: string; text: string; createdAt: string };
export type SpaceSeat = { id: string; userId: string; sessionId: string; expiresAt: string };
export type SpaceControls={announcement:string;paused:boolean;closedZones?:string[];revision:number;updatedAt:string|null};
export type NearbyMessage={id:string;userId:string;nickname:string;text:string;kind:'text'|'emote';at:number};
export type SpaceMetrics={sent:number;received:number;errors:number;reconnects:number;apiCalls:number;lastRttMs:number|null;status:'connecting'|'connected'|'reconnecting'|'closed'};
export const initialMetrics=():SpaceMetrics=>({sent:0,received:0,errors:0,reconnects:0,apiCalls:0,lastRttMs:null,status:'connecting'});
export function isNearby(a:{x:number;y:number},b:{x:number;y:number}){return Math.hypot(a.x-b.x,a.y-b.y)<=4;}
export function nearText(value:unknown){return typeof value==='string'&&value.trim()&&value.trim().length<=120?value.trim():null;}
export function participationStatus(mode:'quiet'|'together'|'help'):SpaceStatus{return mode==='together'?'joinable':mode;}
export type SpaceState = { profile: SpaceProfile; peers: SpacePeer[]; messages: SpaceChat[]; seats: SpaceSeat[]; serverNow: string; controls?:SpaceControls; nearby?:NearbyMessage[]; metrics?:SpaceMetrics };
export type FocusClock = { phase: 'idle' | 'focus' | 'break'; duration: number; elapsed: number; runningSince: number | null };
export const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const defaultProfile = (name = '문샷 동료'): SpaceProfile => ({ ...avatarAppearance({}),nickname: name.slice(0,24), gender: 'male', coat: '#527086', status: 'joinable', lowMotion: false, photoOptIn: false, note: '', desk: '오늘의 작은 한 걸음', accessory:'none',deskTheme:'orbital' });
export function profile(value: unknown, fallback = '문샷 동료'): SpaceProfile {
 const v = value && typeof value === 'object' ? value as Record<string,unknown> : {};
 return { ...avatarAppearance(v),nickname: typeof v.nickname === 'string' && v.nickname.trim() ? v.nickname.trim().slice(0,24) : fallback.slice(0,24), gender: v.gender === 'female' ? 'female' : 'male', coat: typeof v.coat === 'string' && /^#[0-9a-f]{6}$/i.test(v.coat) ? v.coat : '#527086', status: SPACE_STATUSES.includes(v.status as SpaceStatus) ? v.status as SpaceStatus : 'joinable', lowMotion: v.lowMotion === true, photoOptIn: v.photoOptIn === true, note: typeof v.note === 'string' ? v.note.slice(0,2000) : '', desk: typeof v.desk === 'string' ? v.desk.slice(0,120) : '', accessory:v.accessory==='glasses'||v.accessory==='headset'?v.accessory:'none',deskTheme:v.deskTheme==='night'||v.deskTheme==='garden'?v.deskTheme:'orbital' };
}
export function position(value: unknown): { x: number; y: number; sitting: boolean; wave: boolean } | null {
 if (!value || typeof value !== 'object') return null;
 const v = value as Record<string,unknown>;
 if (typeof v.x !== 'number' || typeof v.y !== 'number' || !Number.isFinite(v.x) || !Number.isFinite(v.y) || v.x < 0 || v.x > 24 || v.y < 0 || v.y > 22) return null;
 return { x: Math.round(v.x*100)/100, y: Math.round(v.y*100)/100, sitting: v.sitting === true, wave: v.wave === true };
}
export function elapsed(clock: FocusClock, now = Date.now()) { return Math.max(0, Math.floor(clock.elapsed + (clock.runningSince === null ? 0 : Math.max(0, now-clock.runningSince)/1000))); }
export function clockText(clock: FocusClock, now = Date.now()) { const value = clock.duration ? Math.max(0,clock.duration-elapsed(clock,now)) : elapsed(clock,now); return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`; }
export function pauseClock(clock: FocusClock, now = Date.now()): FocusClock { return {...clock, elapsed: elapsed(clock,now), runningSince: null}; }
export function resumeClock(clock: FocusClock, now = Date.now()): FocusClock { return {...clock,runningSince: clock.phase !== 'idle' && clock.runningSince === null ? now : clock.runningSince}; }
export function publicPeer(id: string, sessionId: string, p: SpaceProfile, now = Date.now()): SpacePeer { return {...avatarAppearance(p),userId:id,sessionId,nickname:p.nickname,gender:p.gender,coat:p.coat,status:p.status,photoOptIn:p.photoOptIn,accessory:p.accessory,focusUntil:null,focusMode:0,expiresAt:new Date(now+75000).toISOString(),x:12,y:8.8,sitting:false}; }
export function isWorldMessage(event: {origin: string; source: unknown; data: unknown}, origin: string, source: unknown, token: string): boolean {
 const d=event.data as Record<string,unknown> | null;
 return event.origin===origin && event.source===source && !!d && d.source==='moonshot-world' && d.token===token && token.length>=32 && ['boot','ready','navigate','seat','wave','position','photo','error','appearance-draft','appearance-save','appearance-cancel'].includes(String(d.type));
}
export function makeLimiter(interval = 500) { let previous = -Infinity; return (now = Date.now()) => { if(now-previous<interval) return false; previous=now;return true; }; }
// One pending movement replaces older coordinates; gestures are coalesced, never queued unboundedly.
export function createMotionQueue(send:(value:NonNullable<ReturnType<typeof position>>)=>void,visible=()=>typeof document==='undefined'||!document.hidden){
 let pending:NonNullable<ReturnType<typeof position>>|null=null,timer:ReturnType<typeof setTimeout>|null=null,last=-Infinity,closed=false;
 const flush=()=>{timer=null;if(closed||!visible()){pending=null;return;}if(!pending)return;const delay=500-(Date.now()-last);if(delay>0){timer=setTimeout(flush,delay);return;}const value=pending;pending=null;last=Date.now();send(value);};
 return {push(value:unknown){if(closed)return;const next=position(value);if(!next)return;pending={...next,wave:next.wave||!!pending?.wave};if(!timer)flush();},close(){closed=true;pending=null;if(timer)clearTimeout(timer);timer=null;}};
}

export function cohortGoalReached(progress:{cohortLaunches?:number;cohortGoal?:number}|null|undefined){return !!progress&&Number.isSafeInteger(progress.cohortLaunches)&&Number.isSafeInteger(progress.cohortGoal)&&progress.cohortGoal!>0&&progress.cohortLaunches!>=progress.cohortGoal!;}
