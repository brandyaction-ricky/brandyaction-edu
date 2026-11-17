import {spawn} from 'node:child_process';
import {execFileSync} from 'node:child_process';
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),edu=resolve(here,'../..');
const myin=process.argv[2]&&resolve(process.argv[2]);
if(!myin)throw Error('MYIN checkout is required; N6 report checks must not be skipped');
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
const n6=(await readdir(join(myin,'tests'))).filter(f=>/^n30-edu-.*\.test\.mjs$/.test(f)).sort().map(f=>'tests/'+f);
if(!n6.includes('tests/n30-edu-legacy-vocabulary.test.mjs'))throw Error('N6 legacy report regression test missing');
const groups=[
  {id:'release-guard',cwd:edu,files:['tools/release-guard/gate.test.mjs','tools/release-guard/migrations.test.mjs']},
  {id:'enrollment-welcome',cwd:edu,files:['tests/campus-entry.test.mjs','tests/campus-welcome-account.test.mjs']},
  {id:'lesson-access',cwd:edu,files:['tests/preserved-lesson-access.test.mjs']},
  {id:'partial-refund-n6',cwd:edu,files:['tests/diagnosis-partial-refund-database.test.mjs']},
  {id:'existing-n6-report',cwd:myin,files:n6},
];
await mkdir(join(here,'.artifacts'),{recursive:true});
const report={kind:'isolated-core-qa-not-production-approval',startedAt:new Date().toISOString(),eduSha:git(edu,'rev-parse','HEAD'),myinSha:git(myin,'rev-parse','HEAD'),eduDirty:!!git(edu,'status','--porcelain','--untracked-files=normal'),myinDirty:!!git(myin,'status','--porcelain','--untracked-files=normal'),checks:[]};
async function execute(cwd,args){
  return await new Promise((resolve,reject)=>{
    const p=spawn(process.execPath,args,{cwd,env:{PATH:process.env.PATH,LANG:process.env.LANG},stdio:['ignore','pipe','pipe']});let output='';
    const timer=setTimeout(()=>p.kill('SIGTERM'),180000);
    p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('error',reject);
    p.on('close',code=>{clearTimeout(timer);resolve({code,output});});
  });
}
for(const group of groups){
  for(const f of group.files)await readFile(join(group.cwd,f));
  const result=await execute(group.cwd,['--test','--test-reporter=tap',...group.files]);
  await writeFile(join(here,'.artifacts',group.id+'.tap'),result.output,{mode:0o600});
  const metric=name=>{const m=[...result.output.matchAll(new RegExp(`^# ${name} (\\d+)$`,'gm'))];return m.length?Number(m.at(-1)[1]):null;};
  const row={id:group.id,passed:metric('pass'),failed:metric('fail'),skipped:metric('skipped'),cancelled:metric('cancelled'),exitCode:result.code};
  row.status=result.code===0&&row.passed>0&&row.failed===0&&row.skipped===0&&row.cancelled===0?'passed':'failed';
  report.checks.push(row);console.log(JSON.stringify(row));
}
const db=await execute(edu,['tools/release-guard/db-compatibility.mjs']);
await writeFile(join(here,'.artifacts','rest-db.log'),db.output,{mode:0o600});
let matrix;try{matrix=JSON.parse(db.output.trim().split('\n').at(-1));}catch{matrix=null;}
report.database={exitCode:db.code,result:matrix,status:db.code===0&&matrix?.newCodeNewDb==='passed'&&matrix?.oldCodeNewDb==='blocked: PGRST201 (expected regression)'?'passed':'failed'};
report.completedAt=new Date().toISOString();report.passed=report.checks.every(c=>c.status==='passed')&&report.database.status==='passed';
await writeFile(join(here,'.artifacts','core-summary.json'),JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify({passed:report.passed,report:'tools/release-guard/.artifacts/core-summary.json',productionChanged:false}));
if(!report.passed)process.exitCode=1;
