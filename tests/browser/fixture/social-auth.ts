import {createClient as memberClient} from './member-auth';
// Synthetic OAuth capture only: no provider, Auth service or real account.
export function createClient(){const client=memberClient();return {auth:{...client.auth,signInWithOAuth:async(body:unknown)=>{const response=await fetch('/synthetic-auth/oauth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {error:response.ok?null:{message:'Synthetic OAuth unavailable'}};}}};}
