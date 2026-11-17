import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {toWire,fromWire,acceptsHost,visiblePeers} from '../public/campus/world/office/contract.mjs';
import {getStudySeats,getCampusRoom} from '../public/campus/world/office/vendor/campus-plan.js';

test('all study seats and terrace positions round-trip through the unchanged EDU position contract',()=>{
 for(const point of [...getStudySeats(),getCampusRoom('study').center,{x:3.9,y:23.5}]){
  const wire=toWire(point);assert(wire);assert(wire.x>=0&&wire.x<=24&&wire.y>=0&&wire.y<=22);
  const result=fromWire(wire);assert(result);assert(Math.hypot(point.x-result.x,point.y-result.y)<1e-9);
 }
});
test('private office, nonfinite, missing and out-of-bound positions are never broadcast',()=>{
 for(const point of [null,{}, {x:NaN,y:1},{x:27,y:17},{x:Infinity,y:0}])assert.equal(toWire(point),null);
 for(const point of [null,{}, {x:-1,y:0},{x:25,y:3},{x:0,y:23},{x:NaN,y:0}])assert.equal(fromWire(point),null);
});
test('host requires origin, exact parent, channel token and an allowlisted command',()=>{
 const parent={},token='a'.repeat(36),origin='https://edu.example';
 const event={origin,source:parent,data:{source:'moonshot-host',token,type:'profile',payload:{}}};
 assert.equal(acceptsHost(event,origin,parent,token),true);
 for(const value of [{...event,origin:'https://attacker.example'},{...event,source:{}},{...event,data:{...event.data,token:'wrong'}},{...event,data:{...event.data,type:'execute'}},{...event,data:null}])assert.equal(acceptsHost(value,origin,parent,token),false);
});
test('peer rendering is capped, deduplicated and strips extra identity/role/private fields',()=>{
 const point=toWire(getCampusRoom('study').center);
 const items=Array.from({length:1000},(_,i)=>({id:'peer-'+i,name:'x'.repeat(80),...point,role:'admin',email:'private@example.com',token:'secret',coat:'url(javascript:bad)'}));
 const peers=visiblePeers([items[0],...items]);assert.equal(peers.length,24);assert.equal(peers[0].name.length,24);assert.equal(peers[0].coat,'#527086');
 assert(!('email'in peers[0]));assert(!('role'in peers[0]));assert(!('token'in peers[0]));
});
test('import is pinned, has original licenses and contains no upstream app, API, snapshots or dependency trees',()=>{
 const base='public/campus/world/office/',manifest=JSON.parse(readFileSync(base+'PROVENANCE.json'));
 for(const file of manifest.files)assert.equal(createHash('sha256').update(readFileSync(base+'vendor/'+file.path)).digest('hex'),file.importSha256,file.path);
 const names=readdirSync(base+'vendor');for(const excluded of ['api','app.js','snapshots','node_modules','study-ui.js','privacy.html'])assert(!names.includes(excluded));
 assert.match(readFileSync(base+'vendor/LICENSE','utf8'),/MIT License/);
 const bridge=readFileSync(base+'bridge.mjs','utf8');assert(!/\bfetch\s*\(|localStorage|WebSocket|study_session/.test(bridge));
});
