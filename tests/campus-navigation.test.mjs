import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['features/campus/ui/navigation.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {campusReturnPath,withCampusReturn,validSection,requestedEnrollment}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const source='/campus/workspace?enrollmentId=00000000-0000-4000-8000-000000000001&section=space&view=immersive';
test('return hints keep only known campus routes and parameters',()=>{
 assert.equal(campusReturnPath(source+'&admin=true'),source);
 for(const bad of ['https://evil.example'+source,'//evil.example'+source,'/campus/workspace?enrollmentId=evil','/campus/workspace/../admin?enrollmentId=00000000-0000-4000-8000-000000000001'])assert.equal(campusReturnPath(bad),null);
 assert.equal(validSection('admin'),'learning');
});
test('lesson handoff preserves its mission query and returns to the right view',()=>{
 const href=withCampusReturn('/learn/123/456/mission?mission=789',source);const url=new URL(href,'https://edu.example');
 assert.equal(url.searchParams.get('mission'),'789');assert.equal(url.searchParams.get('campusReturn'),source);
 assert.equal(withCampusReturn('https://other.example/',source),'https://other.example/');
});

test('entry accepts only a well-formed enrollment hint; server authorization still applies',()=>{
 assert.equal(requestedEnrollment('?enrollmentId=00000000-0000-4000-8000-000000000001'),'00000000-0000-4000-8000-000000000001');
 assert.equal(requestedEnrollment('?enrollmentId=../admin'),null);assert.equal(requestedEnrollment(''),null);
});
