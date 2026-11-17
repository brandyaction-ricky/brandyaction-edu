import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=process.argv[2];if(!out)throw Error('Pass an isolated output directory');
await mkdir(out,{recursive:true});
await build({entryPoints:['tests/campus-fixture/event-preview.tsx'],outdir:out,bundle:true,minify:true,format:'esm',platform:'browser',jsx:'automatic',alias:{'next/link':resolve('tests/browser/fixture/link.tsx'),'@/lib/supabase/client':resolve('tests/campus-fixture/event-preview-storage.ts')},define:{'process.env.NODE_ENV':'"production"'}});
await writeFile(resolve(out,'index.html'),'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>문샷 당첨자 이벤트 존 · 미리보기</title><link rel="stylesheet" href="/event-preview.css"><style>body{margin:0}button{cursor:pointer}a{color:inherit}</style></head><body><div id="root"></div><script type="module" src="/event-preview.js"></script></body></html>');
await writeFile(resolve(out,'vercel.json'),JSON.stringify({version:2,framework:null,buildCommand:'',installCommand:'',outputDirectory:'.',rewrites:[{source:'/(.*)',destination:'/index.html'}],headers:[{source:'/(.*)',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'Referrer-Policy',value:'no-referrer'}]}]}));
