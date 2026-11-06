import {createServer} from 'node:http';
import {createCampusHub} from './hub.mjs';
import {verifyTicket} from './tickets.mjs';
// A dedicated event process. Never auto-started by Next.js or installed as a production route.
const secret=process.env.CAMPUS_REALTIME_SIGNING_SECRET,eventId=process.env.CAMPUS_REALTIME_EVENT_ID;
const origins=(process.env.CAMPUS_REALTIME_ALLOWED_ORIGINS||'').split(',').filter(Boolean);
if(!secret||secret.length<32||!eventId||!origins.length)throw Error('Configure a dedicated signing secret, event ID and exact allowed origins before starting');
for(const value of origins){const u=new URL(value);if(u.origin!==value||u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))throw Error('Invalid allowed origin');}
const hub=createCampusHub({allowedOrigins:origins,authorizationLeaseMs:90000,authenticateJoin:async(_req,data)=>verifyTicket(data.joinToken,secret,eventId)});
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/healthz'&&req.method==='GET'){res.writeHead(200,{'Cache-Control':'no-store'}).end('ok');return;}if(!await hub.handle(req,res,url))res.writeHead(404).end();}catch{if(!res.headersSent)res.writeHead(503);res.end();}});
server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxConnections=6000;
server.listen(Number(process.env.PORT||8787),process.env.CAMPUS_REALTIME_HOST||'127.0.0.1',()=>console.log('Campus event gateway ready'));
let closing=false;function shutdown(){if(closing)return;closing=true;hub.close();server.close(()=>process.exit(0));setTimeout(()=>{server.closeAllConnections();process.exit(0);},5000).unref();}process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
