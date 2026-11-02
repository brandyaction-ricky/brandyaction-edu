import {createServer} from 'node:http';
import {build} from 'esbuild';
import {resolve} from 'node:path';
const output=await build({entryPoints:['tests/campus-fixture/app.tsx'],bundle:true,write:false,outdir:'campus-fixture',format:'esm',platform:'browser',jsx:'automatic',alias:{'next/link':resolve('tests/browser/fixture/link.tsx')},define:{'process.env.NODE_ENV':'"development"'}});
const assets=new Map(output.outputFiles.map(f=>['/'+f.path.split('/').at(-1),f.contents]));
const fixture=await build({entryPoints:['tests/campus-fixture/data.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {student,admin}=await import('data:text/javascript;base64,'+Buffer.from(fixture.outputFiles[0].text).toString('base64'));
const server=createServer((req,res)=>{const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');if(req.method!=='GET'){res.writeHead(405).end();return;}
if(url.pathname==='/api/campus/focus'){res.writeHead(404,{'Content-Type':'application/json'}).end(JSON.stringify({error:'준비 중'}));return;}
if(url.pathname==='/api/campus'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(url.searchParams.has('enrollmentId')?student:{...student,selectedEnrollmentId:null,lessons:[]}));return;}
if(url.pathname==='/api/campus/admin'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(url.searchParams.has('cohortId')?admin:{schemaVersion:1,cohorts:[{id:admin.cohort.id,name:admin.cohort.name,courseTitle:admin.cohort.courseTitle}]}));return;}
if(assets.has(url.pathname)){res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'text/javascript');res.end(assets.get(url.pathname));return;}
res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>문샷 성장·운영 대시보드 — 가상 미리보기</title><link rel="stylesheet" href="/app.css"><style>body{margin:0}button,select{font-family:inherit}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');});
server.listen(Number(process.env.CAMPUS_QA_PORT||4486),'127.0.0.1',()=>console.log('Campus synthetic preview: http://127.0.0.1:'+(process.env.CAMPUS_QA_PORT||4486)));
