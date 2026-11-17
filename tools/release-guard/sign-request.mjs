// Run only by the approval authority, outside the credential-bearing runner.
// This does not create a signing key and must never run automatically in CI.
import {sign} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {privateFile, verifyEnvelope} from './registry.mjs';
import {digest} from './gate.mjs';
import {createPublicKey} from 'node:crypto';
const [requestFile,keyFile,outputFile,...flags]=process.argv.slice(2);
if(!outputFile||!flags.includes('--approve-code')||flags.some(f=>!['--approve-code','--approve-sql'].includes(f)))throw Error('Usage: sign-request.mjs REQUEST PRIVATE_KEY OUTPUT --approve-code [--approve-sql]');
const {plan,evidence,baseAttestation}=JSON.parse(await privateFile(requestFile));
if(plan.migrations.length&&!flags.includes('--approve-sql'))throw Error('SQL approval must be explicit');
const key=await privateFile(keyFile),planDigest=digest(plan);
const payload={plan,evidence,...(baseAttestation?{baseAttestation}:{}),expiresAt:Date.now()+3600000,approvals:{code:planDigest,...(flags.includes('--approve-sql')?{sql:planDigest}:{})}};
const envelope={payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),key).toString('base64')};
verifyEnvelope(envelope,createPublicKey(key));
await writeFile(outputFile,JSON.stringify(envelope,null,2),{mode:0o600,flag:'wx'});
console.log(JSON.stringify({signed:true,planDigest,productionWrites:0}));
