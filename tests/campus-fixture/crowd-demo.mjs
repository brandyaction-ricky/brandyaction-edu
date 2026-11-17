import {startCrowdVisitors} from './crowd-visitors.mjs';
const port=Number(process.env.CAMPUS_CROWD_PORT||4563);if(![4559,4563].includes(port))throw Error('Use the dedicated local demo port');
const connect=()=>startCrowdVisitors('http://172.16.41.153:'+port,60,{socialGroups:true,animate:true});
let visitors=await connect(),stopping=false,renewing=false;
console.log('60 explicitly labelled synthetic QA sessions connected; no real student count inflation.');
// Refresh marked QA leases before the gateway's 15-minute maximum, without extending real authorization.
const renewal=setInterval(async()=>{if(stopping||renewing)return;renewing=true;try{await visitors.stop();if(!stopping)visitors=await connect();}catch(e){console.error('Local QA crowd renewal failed:',e.message);}finally{renewing=false;}},12*60*1000);
async function stop(){if(stopping)return;stopping=true;clearInterval(renewal);await visitors.stop();process.exit(0);}process.on('SIGINT',stop);process.on('SIGTERM',stop);
