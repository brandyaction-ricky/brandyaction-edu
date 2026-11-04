import {startCrowdVisitors} from './crowd-visitors.mjs';
const visitors=await startCrowdVisitors('http://172.16.41.153:4559',60);
console.log('60 explicitly labelled synthetic QA sessions connected; no real student count inflation.');
const motion=setInterval(()=>{visitors.clients.forEach((c,i)=>{if(i%5!==1)return;const phase=Date.now()/2500+i;void visitors.post({...c.session,kind:'update',x:c.x+Math.sin(phase)*.3,y:c.y+Math.cos(phase)*.3,yaw:phase,moving:true}).catch(()=>{});});},1000);
let stopping=false;async function stop(){if(stopping)return;stopping=true;clearInterval(motion);await visitors.stop();process.exit(0);}process.on('SIGINT',stop);process.on('SIGTERM',stop);
