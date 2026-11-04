import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
const roles=new Set(['guest','waiting','student','admin']);
function key(secret){if(typeof secret!=='string'||Buffer.byteLength(secret)<32)throw Error('A dedicated signing secret of at least 32 bytes is required');return secret;}
export function issueTicket({eventId,subject,role='guest',ttlSeconds=60},secret,now=Date.now()){
 if(!eventId||!subject||!roles.has(role)||!Number.isInteger(ttlSeconds)||ttlSeconds<1||ttlSeconds>120)throw Error('Invalid trusted claims');
 const body=Buffer.from(JSON.stringify({eventId,subject,role,exp:Math.floor(now/1000)+ttlSeconds,nonce:randomUUID()})).toString('base64url');return body+'.'+createHmac('sha256',key(secret)).update(body).digest('base64url');
}
export function verifyTicket(token,secret,eventId,now=Date.now()){
 key(secret);if(typeof token!=='string'||token.length>2048)return null;const [body,sig,extra]=token.split('.');if(extra||!body||!sig||!/^[\w-]+$/.test(sig))return null;
 const expected=createHmac('sha256',secret).update(body).digest(),actual=Buffer.from(sig,'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
 try{const p=JSON.parse(Buffer.from(body,'base64url').toString());return p.eventId===eventId&&typeof p.subject==='string'&&p.subject.length>0&&p.subject.length<=200&&roles.has(p.role)&&typeof p.nonce==='string'&&Number.isSafeInteger(p.exp)&&p.exp>now/1000&&p.exp<=now/1000+120?p:null;}catch{return null;}
}
