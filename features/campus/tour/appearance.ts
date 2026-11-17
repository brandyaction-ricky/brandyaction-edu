export const TOUR_AVATAR_KEY='moonshot-tour-avatar-v1';
export type TourAvatar={nickname:string;gender:'male'|'female';model:number;coat:string;hairColor:string;skinColor:string;pantsColor:string;heldItem:'none'|'coffee'|'book'};
export function tourAvatar(value:unknown):TourAvatar{
 const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const color=(key:string,fallback:string)=>typeof v[key]==='string'&&/^#[0-9a-f]{6}$/i.test(v[key] as string)?(v[key] as string).toLowerCase():fallback;
 return {nickname:typeof v.nickname==='string'?v.nickname.trim().slice(0,24)||'나 · 미리보기':'나 · 미리보기',gender:v.gender==='female'?'female':'male',model:Number.isInteger(v.model)&&Number(v.model)>=0&&Number(v.model)<=5?Number(v.model):0,coat:color('coat','#386eb4'),hairColor:color('hairColor','#302825'),skinColor:color('skinColor','#e8b68b'),pantsColor:color('pantsColor','#36485d'),heldItem:v.heldItem==='coffee'||v.heldItem==='book'?v.heldItem:'none'};
}
export function readTourAvatar(key=TOUR_AVATAR_KEY,nickname?:string):TourAvatar{try{const saved=localStorage.getItem(key);return tourAvatar(saved?JSON.parse(saved):{nickname});}catch{return tourAvatar({nickname});}}
