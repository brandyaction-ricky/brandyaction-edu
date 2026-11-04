import {crowdMotion} from './crowd-layout.mjs';
import {startCrowdVisitors} from './crowd-visitors.mjs';
const port=Number(process.env.CAMPUS_CROWD_PORT||4563);if(![4559,4563].includes(port))throw Error('Use the dedicated local demo port');
const connect=()=>startCrowdVisitors('http://172.16.41.153:'+port,60,{socialGroups:true});
let visitors=await connect(),stopping=false,renewing=false;
console.log('60 explicitly labelled synthetic QA sessions connected; no real student count inflation.');
const motion=setInterval(()=>{if(renewing)return;visitors.clients.forEach((c,i)=>{const {x,y,yaw,moving}=crowdMotion(c,i,Date.now()/1000);void visitors.post({...c.session,kind:'update',x,y,yaw,moving}).catch(()=>{});});},1000);
// Refresh marked QA leases before the gateway's 15-minute maximum, without extending real authorization.
const renewal=setInterval(async()=>{if(stopping||renewing)return;renewing=true;try{await visitors.stop();if(!stopping)visitors=await connect();}catch(e){console.error('Local QA crowd renewal failed:',e.message);}finally{renewing=false;}},12*60*1000);
async function stop(){if(stopping)return;stopping=true;clearInterval(motion);clearInterval(renewal);await visitors.stop();process.exit(0);}process.on('SIGINT',stop);process.on('SIGTERM',stop);
