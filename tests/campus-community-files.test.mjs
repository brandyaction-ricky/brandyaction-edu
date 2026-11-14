import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
async function load(path){const r=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));}
const {handlePortfolioFiles}=await load('../features/campus/community/file-handler.ts');const {portfolioFileSpec,matchesPortfolioFile}=await load('../features/campus/community/files.ts');const {handleFlow}=await load('../features/campus/community/workflow-server.ts');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('portfolio file contract validates extensions, size and binary signatures, excludes executable/browser content',()=>{
 for(const name of ['x.svg','x.html','x.exe','../x.png','x\n.png'])assert.throws(()=>portfolioFileSpec(name,10));assert.throws(()=>portfolioFileSpec('x.png',10485761));
 const spec=portfolioFileSpec('캡처.png',8);assert.equal(spec.contentType,'image/png');assert.equal(matchesPortfolioFile(Uint8Array.from([137,80,78,71,13,10,26,10]),spec),true);
 assert.equal(matchesPortfolioFile(new TextEncoder().encode('<script>'),spec),false);
});
test('a video preview is accepted by signature, carries a 30-day date, and is refused once the date passes or it was swept',async()=>{
 const {videoExpiry}=await load('../features/campus/community/files.ts');
 const mp4=portfolioFileSpec('광고-미리보기.mp4',12),webm=portfolioFileSpec('광고.webm',8);assert.equal(mp4.contentType,'video/mp4');assert.equal(webm.contentType,'video/webm');
 assert.equal(matchesPortfolioFile(Uint8Array.from([0,0,0,24,102,116,121,112,105,115,111,109]),mp4),true);assert.equal(matchesPortfolioFile(new TextEncoder().encode('<html>12345a'),mp4),false);
 assert.equal(matchesPortfolioFile(Uint8Array.from([26,69,223,163,1,2,3,4]),webm),true);assert.throws(()=>portfolioFileSpec('영상.mov',10));assert.throws(()=>portfolioFileSpec('큰영상.mp4',10485761));
 const now=Date.parse('2026-12-01T00:00:00Z'),at=d=>new Date(now-d*86400000).toISOString();
 assert.deepEqual(videoExpiry({content_type:'image/png',created_at:at(400)},now),{expiresAt:null,expired:false});
 assert.equal(videoExpiry({content_type:'video/mp4',created_at:at(29)},now).expired,false);assert.equal(videoExpiry({content_type:'video/mp4',created_at:at(30)},now).expired,true);assert.equal(videoExpiry({content_type:'video/mp4',created_at:at(1),removed_at:at(0)},now).expired,true);
 const file=days=>({id:uid(10),owner_id:uid(1),post_id:uid(2),post_revision:1,name:'광고-미리보기.mp4',size:12,content_type:'video/mp4',path:'p',state:'ready',sha256:'a'.repeat(64),visibility:'cohort',revision:2,created_at:new Date(Date.now()-days*86400000).toISOString()});
 let swept=0;const ports=days=>async()=>({readable:async()=>file(days),list:async()=>[file(days),{...file(2),id:uid(11),state:'pending',removed_at:new Date().toISOString()}],signedDownload:async()=>'https://storage.example.com/signed/v',sweep:async()=>{swept++;throw Error('storage down');},prepare:async c=>({...file(0),state:'pending',...c}),signedUpload:async()=>'https://storage.example.com/up'});
 const call=(days,path,init)=>handlePortfolioFiles(new Request('https://edu.example.com/api/campus/community/files'+path,init),{enabled:true,authenticate:async()=>({id:uid(1)}),ports:ports(days)});
 assert.equal((await call(3,'?fileId='+uid(10))).status,302);assert.equal((await call(31,'?fileId='+uid(10))).status,410);
 const listed=(await (await call(3,'?postId='+uid(2))).json()).files;assert.equal(listed.length,1);assert.equal(listed[0].expired,false);assert.ok(listed[0].expiresAt);
 // An upload still goes through when the sweep of old previews fails.
 const prepared=await call(0,'',{method:'POST',headers:{'content-type':'application/json',origin:'https://edu.example.com'},body:JSON.stringify({action:'prepare',postId:uid(2),requestId:uid(12),expectedRevision:1,name:'새 영상.mp4',size:12})});assert.equal(prepared.status,200);assert.equal(swept,1);
});
test('file API authenticates, validates upload completion, issues short private redirect only after authorization and requires explicit sharing',async()=>{
 let completes=0,prepared=null;const bytes=new TextEncoder().encode('%PDF-1.7\nlocal fake fixture');
 const file={id:uid(10),owner_id:uid(1),post_id:uid(2),post_revision:1,name:'문샷 기획.pdf',size:bytes.length,content_type:'application/pdf',path:'private/server/path',state:'pending',sha256:null,visibility:'private',revision:1};
 let actual=bytes,allowed=true,shares=0;const ports={readable:async()=>{if(!allowed)throw Object.assign(Error('scope'),{status:403});return file;},signedDownload:async()=> 'https://storage.example.com/signed/file?expires=30',share:async()=>{shares++;return{};},list:async()=>[file],owned:async()=>file,prepare:async c=>{prepared=c;return file;},signedUpload:async()=> 'https://storage.example.com/signed/fixture',read:async()=>({bytes:actual,contentType:'application/pdf'}),complete:async(_id,hash)=>{completes++;file.sha256=hash;file.state='ready';}};
 const deps={enabled:true,authenticate:async()=>({id:uid(1)}),ports:async()=>ports};
 const request=body=>new Request('https://edu.test/api/campus/community/files',{method:'POST',headers:{origin:'https://edu.test','content-type':'application/json'},body:JSON.stringify(body)});
 const prepare={action:'prepare',postId:uid(2),requestId:uid(10),expectedRevision:1,name:file.name,size:file.size,ownerId:uid(99),path:'attacker/file'};
 assert.equal((await handlePortfolioFiles(request(prepare),{...deps,authenticate:async()=>null})).status,401);
 const response=await handlePortfolioFiles(request(prepare),deps);assert.equal(response.status,200);const body=await response.json();assert.ok(body.signedUrl);assert.equal(body.path,undefined);assert.equal(body.owner_id,undefined);assert.equal(prepared.ownerId,undefined);assert.equal(prepared.path,undefined);
 actual=new TextEncoder().encode('<html>');assert.equal((await handlePortfolioFiles(request({action:'complete',fileId:file.id}),deps)).status,400);assert.equal(completes,0);
 actual=bytes;assert.equal((await handlePortfolioFiles(request({action:'complete',fileId:file.id}),deps)).status,200);assert.equal(completes,1);
 const get=new Request('https://edu.test/api/campus/community/files?fileId='+file.id);const download=await handlePortfolioFiles(get,deps);assert.equal(download.status,302);assert.ok(download.headers.get('location').includes('expires=30'));assert.equal(download.headers.get('x-content-type-options'),'nosniff');assert.equal(download.headers.get('cache-control'),'private, no-store');
 assert.equal(file.sha256,createHash('sha256').update(bytes).digest('hex'));allowed=false;assert.equal((await handlePortfolioFiles(get,deps)).status,403);assert.equal((await handlePortfolioFiles(get,{...deps,authenticate:async()=>null})).status,401);
 const share={action:'share',requestId:uid(30),fileId:file.id,expectedRevision:1,visibility:'cohort'};assert.equal((await handlePortfolioFiles(request(share),deps)).status,400);assert.equal(shares,0);assert.equal((await handlePortfolioFiles(request({...share,confirmed:true,owner_id:uid(9)}),deps)).status,200);assert.equal(shares,1);
});
test('workflow API rejects foreign origins, invalid transitions input, unauthenticated access and oversized streams',async()=>{
 let saves=0;const deps={enabled:true,authenticate:async()=>({id:uid(1)}),load:async()=>({exchanges:[]}),save:async()=>{saves++;return{};}};
 const post=body=>new Request('https://edu.test/api/campus/community/workflows',{method:'POST',headers:{origin:'https://edu.test','content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await handleFlow(post({}),deps)).status,400);assert.equal(saves,0);
 const c={requestId:uid(4),postId:uid(2),action:'exchange_propose',note:'구체적으로 어떤 작업을 도울지 적습니다.',alias:'동료'};
 assert.equal((await handleFlow(post(c),deps)).status,200);assert.equal(saves,1);
 assert.equal((await handleFlow(post(c),{...deps,authenticate:async()=>null})).status,401);
 const foreign=post(c);foreign.headers.set('origin','https://other.test');assert.equal((await handleFlow(foreign,deps)).status,403);
 let pulled=0,canceled=false;const stream=new ReadableStream({pull(c){pulled++;c.enqueue(new Uint8Array(12000));if(pulled===100)c.close();},cancel(){canceled=true;}});const huge=new Request('https://edu.test/api/campus/community/workflows',{method:'POST',headers:{origin:'https://edu.test','content-type':'application/json'},body:stream,duplex:'half'});
 assert.equal((await handleFlow(huge,deps)).status,400);assert.ok(pulled<5);assert.equal(canceled,true);
});
