// Offline validator: intentionally has NO production write command.
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {validate} from './gate.mjs';
const [planFile,observationFile,evidenceFile,checkout,...extra]=process.argv.slice(2);
if(!checkout||extra.length)throw Error('Usage: node verify-plan.mjs PLAN OBSERVATION EVIDENCE CHECKOUT (validation only)');
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const result=await validate(await read(planFile),await read(observationFile),await read(evidenceFile),async(base,candidate)=>{
  try {execFileSync('git',['merge-base','--is-ancestor',base,candidate],{cwd:checkout,stdio:'ignore'});return true;}catch{return false;}
});
console.log(JSON.stringify({...result,productionWrites:0,activation:'requires-reviewed-production-adapter-and-settings-approval'}));
