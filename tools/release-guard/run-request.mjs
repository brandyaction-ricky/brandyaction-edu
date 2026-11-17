import {join} from 'node:path';
import {privateFile, verifyEnvelope} from './registry.mjs';
import {createAdapter} from './provider-adapter.mjs';
import {coordinate, acquireLock, validate} from './gate.mjs';

const [configPath,requestId,mode,...extra]=process.argv.slice(2);
if(!configPath||!/^[a-zA-Z0-9_-]{1,80}$/.test(requestId||'')||!['--preflight','--execute'].includes(mode)||extra.length)throw Error('Usage: run-request.mjs OWNER_ONLY_CONFIG REQUEST_ID --preflight|--execute');
const config=JSON.parse(await privateFile(configPath));
if(mode==='--execute'&&config.executionEnabled!==true)throw Error('Execution disabled pending activation approval');
const publicKey=await privateFile(config.approvalPublicKeyFile);
const envelope=JSON.parse(await privateFile(join(config.requestRoot,requestId+'.json')));
const {plan,evidence}=verifyEnvelope(envelope,publicKey);
const adapter=await createAdapter(config,envelope,{requestId,publicKey});
try{
  if(mode==='--preflight'){
    const lock=await acquireLock(config.lockRoot);
    try{await validate(plan,await adapter.observe(),evidence,adapter.isAncestor);await adapter.verifyApprovals();console.log(JSON.stringify({validated:true,productionWrites:0}));}
    finally{await lock.release();}
  }else{
    const result=await coordinate({plan,evidence,lockRoot:config.lockRoot,adapter});console.log(JSON.stringify(result));
  }
}finally{await adapter.close();}
