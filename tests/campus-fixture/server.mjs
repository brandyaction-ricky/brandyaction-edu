import {createPreviewMeetup} from './meetup-server.mjs';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {resolve,extname} from 'node:path';
import {readFileSync,existsSync} from 'node:fs';
// Optional private-LAN synthetic preview. Defaults to loopback and never exposes real DB/API routes.
const host=process.env.CAMPUS_QA_HOST||'127.0.0.1';
const octets=host.split('.').map(Number);
if(octets.length!==4||octets.some(n=>!Number.isInteger(n)||n<0||n>255)||!(host==='127.0.0.1'||octets[0]===10||octets[0]===192&&octets[1]===168||octets[0]===172&&octets[1]>=16&&octets[1]<=31))throw Error('Use loopback or a private LAN address for synthetic preview');
// randomUUID needs HTTPS on phones. getRandomValues remains secure and available over local HTTP.
const uuidFallback=`if(!crypto.randomUUID)crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;return [...b].map((v,i)=>([4,6,8,10].includes(i)?'-':'')+v.toString(16).padStart(2,'0')).join('');};`;
const output=await build({entryPoints:['tests/campus-fixture/app.tsx'],bundle:true,write:false,outdir:'campus-fixture',format:'esm',platform:'browser',jsx:'automatic',alias:{'next/link':resolve('tests/browser/fixture/link.tsx')},define:{'process.env':JSON.stringify({NODE_ENV:'development',NEXT_PUBLIC_CAMPUS_LOCAL_MEETUP:'true',NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED:'true',NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED:'true',NEXT_PUBLIC_EDU_CURRICULUM_AI_ENABLED:'true'})}});
const assets=new Map(output.outputFiles.map(f=>['/'+f.path.split('/').at(-1),f.contents]));
const fixture=await build({entryPoints:['tests/campus-fixture/data.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {student,admin}=await import('data:text/javascript;base64,'+Buffer.from(fixture.outputFiles[0].text).toString('base64'));
const meetup=createPreviewMeetup(),testMeetups=new Map();
const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');const ns=String(req.headers['x-campus-test-room']||'');let selected=meetup;if(/^[a-zA-Z0-9_-]{1,120}$/.test(ns)){if(!testMeetups.has(ns)&&testMeetups.size<128)testMeetups.set(ns,createPreviewMeetup());selected=testMeetups.get(ns)||meetup;}if(await selected.handle(req,res,url))return;if(req.method!=='GET'){res.writeHead(405).end();return;}
if(url.pathname.startsWith('/campus/world/')){const base=resolve('public/campus/world');const target=resolve('public'+decodeURIComponent(url.pathname));if(!target.startsWith(base+'/')||!existsSync(target)){res.writeHead(404).end();return;}try{const mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.html':'text/html','.webp':'image/webp','.mp3':'audio/mpeg','.mp4':'video/mp4'};res.setHeader('Content-Type',mime[extname(target)]||'application/octet-stream');res.end(readFileSync(target));}catch{res.writeHead(404).end();}return;}
if(url.pathname==='/api/campus/focus'){res.writeHead(404,{'Content-Type':'application/json'}).end(JSON.stringify({error:'준비 중'}));return;}
if(url.pathname==='/api/campus'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(url.searchParams.has('enrollmentId')?student:{...student,selectedEnrollmentId:null,lessons:[]}));return;}
if(url.pathname==='/api/campus/admin'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(url.searchParams.has('cohortId')?admin:{schemaVersion:1,cohorts:[{id:admin.cohort.id,name:admin.cohort.name,courseTitle:admin.cohort.courseTitle}]}));return;}
if(assets.has(url.pathname)){res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'text/javascript');res.end(assets.get(url.pathname));return;}
res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>문샷 성장·운영 대시보드 — 가상 미리보기</title><link rel="stylesheet" href="/app.css"><style>body{margin:0}button,select{font-family:inherit}</style></head><body><div id="root"></div><script>'+uuidFallback+'</script><script type="module" src="/app.js"></script></body></html>');});
server.listen(Number(process.env.CAMPUS_QA_PORT||4486),host,()=>console.log('Campus synthetic preview: http://'+host+':'+(process.env.CAMPUS_QA_PORT||4486)));
