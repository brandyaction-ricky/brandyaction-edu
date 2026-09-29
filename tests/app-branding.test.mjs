import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import sharp from 'sharp';
import crypto from 'node:crypto';
function load(file,mocks={}) { const out={}; new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,name=>{if(!(name in mocks))throw Error(name);return mocks[name];}); return out; }
const rules=load('lib/app-branding.ts');
const images=load('lib/app-icon-image.ts',{'sharp':{default:sharp},'@/lib/app-branding':rules});
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const png=await sharp({create:{width:512,height:512,channels:4,background:'#05ad49'}}).png().toBuffer();
const hash=crypto.createHash('sha256').update(png).digest('hex');
process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED='true';process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';
function harness({user={id:id(1),role:'admin'},initial=null,race=null,uploadErrorAt=0,dbError=false,commitThenError=false}={}) {
 let stored=initial,applied=false;const uploads=[],removes=[],writes=[],tags=[],reads=[];
 const db={storage:{from:bucket=>{assert.equal(bucket,'course-assets');return{upload:async(path,bytes,opts)=>{uploads.push({path,bytes,opts});return uploads.length===uploadErrorAt?{error:{message:'private storage'}}:{data:{path}};},remove:async paths=>{removes.push(paths);return{data:[]};}};}},from(table){
  assert.equal(table,'site_settings');let action='read',values;const filters=[],q={};q.select=()=>q;q.eq=(k,v)=>{filters.push([k,v]);return q;};q.abortSignal=()=>q;
  for(const method of ['insert','update'])q[method]=v=>{action=method;values=v;return q;};
  q.maybeSingle=async()=>{
   if(dbError)throw Error('private SQL');
   if(action==='read'){reads.push(filters);assert.deepEqual(filters,[['key','edu_app_branding'],['is_public',false]]);return{data:stored?{value:structuredClone(stored)}:null};}
   if(race&&!applied){stored=race;applied=true;}
   if(action==='insert'&&stored)return{error:{code:'23505'}};
   if(action==='update'){assert.deepEqual(filters.slice(0,2),[['key','edu_app_branding'],['is_public',false]]);assert.equal(filters[2][0],'value->>revision');if(stored?.revision!==filters[2][1])return{data:null};}
   assert.equal(values.is_public,false);assert.equal(values.updated_by,id(1));assert.ok(values.updated_at);stored=values.value;writes.push(values);
   if(commitThenError)throw Error('connection lost after commit');return{data:{key:'edu_app_branding'}};
  };return q;
 }};
 const server=load('lib/app-branding-server.ts',{'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/app-branding':rules,'next/cache':{unstable_cache:fn=>fn}});
 const route=load('app/api/admin/app-branding/route.ts',{'node:crypto':crypto,'next/cache':{revalidateTag:(...args)=>tags.push(args)},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v)},'@/lib/app-branding':rules,'@/lib/app-branding-server':server,'@/lib/app-icon-image':images});
 const send=(data={},origin='https://edu.test')=>{const form=new FormData();form.set('action',data.action||'replace');form.set('requestId',data.requestId||id(2));form.set('expectedRevision',data.expected||'');if(data.action!=='reset')form.set('file',new Blob([data.bytes||png],{type:data.type||'image/png'}),'icon.png');return route.POST(new Request('https://edu.test/api/admin/app-branding',{method:'POST',body:form,headers:origin?{origin}:{}}));};
 return{get:route.GET,post:route.POST,send,uploads,removes,writes,tags,reads,stored:()=>stored,public:server.getPublicAppBranding};
}
test('only validated local asset IDs become public URLs; default and malformed settings are separated',()=>{
 assert.equal(rules.publicAppBranding(rules.defaultBranding).icon,'/icons/edu-192.png');
 const valid=rules.readAppBranding({revision:id(2),iconId:id(3),sourceHash:hash,secret:'never expose'}),result=rules.publicAppBranding(valid,'https://fixture.supabase.co');
 assert.match(result.icon,/^https:\/\/fixture.supabase.co\/storage\/v1\/object\/public\/course-assets\/edu\/app-icons\//);assert.doesNotMatch(JSON.stringify(result),/sourceHash|secret/);
 for(const value of [{},[],{revision:id(1),iconId:'../private',sourceHash:hash},{revision:id(1),iconId:id(2),sourceHash:null}])assert.throws(()=>rules.readAppBranding(value));
 for(const url of ['javascript:alert(1)','https://user:pass@fixture.test/','https://fixture.test/private','http://fixture.test/'])assert.throws(()=>rules.publicAppBranding(valid,url));
});
test('real image conversion produces opaque icon sizes, a padded mask and strips embedded metadata',async()=>{
 const original=await sharp(png).withMetadata({density:300}).toBuffer(),result=await images.renderAppIcons(original);
 assert.deepEqual(result.map(x=>x.size),['192','512','apple-180','maskable-512']);
 for(const image of result){const m=await sharp(image.bytes).metadata();assert.equal(m.width,image.size==='192'?192:image.size==='apple-180'?180:512);assert.equal(m.width,m.height);assert.equal(m.hasAlpha,false);assert.equal(m.exif,undefined);}
 const mask=await sharp(result.at(-1).bytes).raw().toBuffer();assert.deepEqual([...mask.subarray(0,3)],[255,255,255]);
 const small=await sharp(png).resize(128,128).toBuffer(),rectangle=await sharp(png).resize(600,512).toBuffer();
 for(const bytes of [small,rectangle,Buffer.from('<svg/>'),Buffer.from('not an image')])await assert.rejects(images.renderAppIcons(bytes));
});
test('anonymous, members, staff, disabled feature and forged origins cannot read admin data or write',async()=>{
 for(const [user,status]of [[null,401],[{role:'member'},403],[{role:'staff'},403]]){const h=harness({user});assert.equal((await h.get()).status,status);assert.equal((await h.send()).status,status);assert.equal(h.reads.length,0);}
 const h=harness();for(const origin of [null,'https://evil.test'])assert.equal((await h.send({},origin)).status,403);
 process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED='false';try{assert.equal((await h.get()).status,404);assert.equal((await h.send()).status,404);}finally{process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED='true';}
 assert.equal(h.uploads.length,0);
});
test('oversized streams, spoofed images and duplicate fields are rejected before storage mutation',async()=>{
 const h=harness();for(const data of [{bytes:Buffer.from('not an image')},{bytes:png,type:'image/svg+xml'},{bytes:await sharp(png).resize(256,256).toBuffer()},{bytes:Buffer.alloc(2*1024*1024+1)}])assert.equal((await h.send(data)).status,400);
 const body=new FormData();body.set('action','reset');body.set('requestId',id(2));body.append('requestId',id(3));body.set('expectedRevision','');assert.equal((await h.post(new Request('https://edu.test/api/admin/app-branding',{method:'POST',headers:{origin:'https://edu.test'},body}))).status,400);
 const request=new Request('https://edu.test/api/admin/app-branding',{method:'POST',headers:{origin:'https://edu.test','content-type':'multipart/form-data; boundary=sample','content-length':'1'},body:Buffer.alloc(2*1024*1024+16385)});assert.equal((await h.post(request)).status,413);assert.equal(h.uploads.length,0);assert.equal(h.writes.length,0);
});
test('upload, response-loss retry, replace and reset keep immutable assets and private revision-based settings',async()=>{
 const h=harness(),first=await h.send();assert.equal(first.status,200);const saved=await first.json();assert.equal(saved.custom,true);assert.equal(first.headers.get('cache-control'),'private, no-store');assert.equal(h.uploads.length,4);
 for(const u of h.uploads){assert.match(u.path,/^edu\/app-icons\/[a-f0-9-]+\/(192|512|apple-180|maskable-512)\.png$/);assert.equal(u.opts.upsert,false);assert.equal(u.opts.contentType,'image/png');}
 assert.equal((await h.send()).status,200);assert.equal(h.uploads.length,4);assert.equal(h.writes.length,1);assert.equal((await h.send({requestId:id(2),bytes:await sharp(png).negate().toBuffer()})).status,409);
 assert.equal((await h.send({action:'reset',expected:id(2),requestId:id(3)})).status,200);assert.equal(h.stored().iconId,null);assert.equal(h.removes.length,0);assert.equal(h.tags.at(-1)[0],'edu-app-branding');assert.equal((await h.public()).icon,'/icons/edu-192.png');
});
test('racing writes preserve the winner and only remove this failed attempt’s new files',async()=>{
 const race={revision:id(8),iconId:id(9),sourceHash:hash};
 for(const initial of [null,{revision:id(4),iconId:id(5),sourceHash:hash}]){const h=harness({initial,race});assert.equal((await h.send({expected:initial?.revision})).status,409);assert.deepEqual(h.stored(),race);assert.equal(h.removes.length,1);assert.ok(h.removes.flat().every(p=>!p.includes(id(9))&&!p.includes(id(5))));}
 const h=harness({initial:race});assert.equal((await h.send()).status,409);assert.equal(h.uploads.length,0);
});
test('failed upload preserves saved settings; uncertain database commit never deletes a potentially live icon',async()=>{
 const initial={revision:id(4),iconId:id(5),sourceHash:hash};const h=harness({initial,uploadErrorAt:2});assert.equal((await h.send({expected:id(4)})).status,503);assert.deepEqual(h.stored(),initial);assert.equal(h.removes.length,1);
 const lost=harness({commitThenError:true});const response=await lost.send();assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/connection|SQL/);assert.equal(lost.removes.length,0);assert.equal((await lost.send()).status,200);assert.equal(lost.uploads.length,4);
 const down=harness({dbError:true});assert.equal((await down.get()).status,503);assert.equal((await down.public()).custom,false);assert.equal(down.uploads.length,0);
});
test('public endpoint and manifest only expose sanitized icon URLs and never change app identity',async()=>{
 const value=rules.publicAppBranding({revision:id(2),iconId:id(3),sourceHash:hash},'https://fixture.supabase.co'),mocks={'@/lib/app-branding-server':{getPublicAppBranding:async()=>value}};
 const route=load('app/api/app-branding/route.ts',mocks);assert.deepEqual(await (await route.GET(new Request('https://edu.test/api/app-branding'))).json(),value);
 const icon=await route.GET(new Request('https://edu.test/api/app-branding?icon=192&url=https://evil.test'));assert.equal(icon.status,307);assert.equal(icon.headers.get('location'),value.icon);
 const manifest=await load('app/manifest.ts',mocks).default();assert.equal(manifest.id,'/');assert.equal(manifest.start_url,'/my');assert.deepEqual(manifest.icons,value.icons);
});
