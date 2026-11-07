// Regression cases preserved from the supplied MIT handoff; imports adapted to EDU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { attachInteriorInteractions } from '../public/campus/world/office/vendor/interior-interactions.js';
import { getInteriorInteractionTargets } from '../public/campus/world/office/vendor/interior-layout.js';

class EventTargetFake{
  constructor(){this.listeners=new Map();}
  addEventListener(type,handler){const list=this.listeners.get(type)||[];list.push(handler);this.listeners.set(type,list);}
  removeEventListener(type,handler){const list=(this.listeners.get(type)||[]).filter(item=>item!==handler);if(list.length)this.listeners.set(type,list);else this.listeners.delete(type);}
  emit(type,values={}){
    const event={target:{closest:()=>null},clientX:0,clientY:0,prevented:false,stopped:false,
      preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...values};
    for(const handler of [...this.listeners.get(type)||[]]){handler(event);if(event.stopped)break;}
    return event;
  }
}
function fixture(){
  const doc=new EventTargetFake();doc.hidden=false;
  const root=new EventTargetFake();root.ownerDocument=doc;root.inert=false;root.style={cursor:''};
  const attributes=new Map();root.setAttribute=(name,value)=>attributes.set(name,value);root.removeAttribute=name=>attributes.delete(name);
  const canvas={getBoundingClientRect:()=>({left:100,top:50,width:400,height:200})};
  const projected=new Map([
    ['office-coffee',{x:100,y:80,radius:24}],['office-globe',{x:116,y:80,radius:24}],
    ['office-mini-rocket',{x:650,y:300,radius:30}],['study-arcade',{x:500,y:180,radius:24}],
  ]);
  let room='office';const effects=[],messages=[];
  const office={canvas,cw:800,ch:400,campusStudyLocked:false,campusAvatar:{x:0,y:0},draws:0,
    projectInteriorPoint:item=>projected.get(item.id),triggerInteriorEffect:id=>{effects.push(id);return true;},draw(){this.draws++;}};
  const api=attachInteriorInteractions({office,root,onMessage:value=>messages.push(value),getRoom:()=>room});
  const client=(x,y)=>({clientX:100+x/2,clientY:50+y/2});
  function click(x,y,extra={}){root.emit('pointerdown',{...client(x,y),...extra});return root.emit('click',{...client(x,y),...extra});}
  function near(id,offset=0){const target=getInteriorInteractionTargets(room).find(item=>item.id===id);assert.ok(target);office.campusAvatar={x:target.center.x+offset,y:target.center.y};}
  return{doc,root,office,api,effects,messages,projected,attributes,client,click,near,setRoom:value=>{room=value;}};
}

test('click uses canvas scaling and activates the nearest overlapping furniture target with its message',()=>{
  const f=fixture(),event=f.click(114,84);
  assert.deepEqual(f.effects,['office-globe']);assert.deepEqual(f.messages,['작은 지구를 한 바퀴 돌려봅니다.']);
  assert.equal(f.office.draws,1);assert.equal(event.prevented,true);assert.equal(event.stopped,true);
  f.click(99,80);assert.equal(f.effects.at(-1),'office-coffee');assert.equal(f.messages.at(-1),'커피 한 잔, 준비됐습니다.');
  f.api.destroy();
});

test('3D mesh picking takes precedence over projected proximity and receives scaled canvas coordinates',()=>{
  const f=fixture(),picks=[];
  f.office.pickInteriorAt=(x,y)=>{picks.push({x,y});return 'office-mini-rocket';};
  f.office.projectInteriorPoint=()=>{throw new Error('3D picking must not use projected approximation');};
  const event=f.click(100,80);
  assert.deepEqual(picks,[{x:100,y:80}]);
  assert.deepEqual(f.effects,['office-mini-rocket']);
  assert.deepEqual(f.messages,['3, 2, 1. 미니 로켓 발사!']);
  assert.equal(event.prevented,true);assert.equal(event.stopped,true);f.api.destroy();
});

test('3D misses and IDs outside the current room interactions never fall back to projected hits',()=>{
  const f=fixture();let projectedCalls=0;
  f.office.projectInteriorPoint=()=>{projectedCalls++;return{x:100,y:80,radius:48};};
  for(const picked of [null,'study-arcade','office-fern-back','unknown-object']){
    f.office.pickInteriorAt=()=>picked;
    const event=f.click(100,80);
    assert.equal(event.prevented,false);assert.equal(event.stopped,false);
  }
  assert.equal(projectedCalls,0);assert.deepEqual(f.effects,[]);assert.deepEqual(f.messages,[]);f.api.destroy();
});

test('orbit dragging and clicks outside all targets never activate an object',()=>{
  const f=fixture();
  f.root.emit('pointerdown',f.client(10,80));
  const dragClick=f.root.emit('click',f.client(100,80));
  assert.equal(dragClick.prevented,false);assert.deepEqual(f.effects,[]);
  const miss=f.click(350,350);assert.equal(miss.stopped,false);assert.deepEqual(f.messages,[]);f.api.destroy();
});

test('form controls ignore click, hover and E interaction without swallowing input',()=>{
  const f=fixture(),control={closest:()=>({tagName:'INPUT'})};
  f.near('office-coffee');
  const click=f.click(100,80,{target:control});
  const key=f.doc.emit('keydown',{code:'KeyE',key:'e',target:control});
  f.root.emit('pointermove',{...f.client(100,80),target:control});
  assert.equal(click.prevented,false);assert.equal(key.prevented,false);
  assert.deepEqual(f.effects,[]);assert.equal(f.root.style.cursor,'');f.api.destroy();
});

test('hidden documents, inert roots and study input locks block pointer and keyboard actions',()=>{
  const f=fixture();f.near('office-coffee');
  for(const[target,key]of [[f.doc,'hidden'],[f.root,'inert'],[f.office,'campusStudyLocked']]){
    target[key]=true;
    assert.equal(f.click(100,80).prevented,false);
    assert.equal(f.doc.emit('keydown',{code:'KeyE',key:'e'}).prevented,false);
    target[key]=false;
  }
  assert.deepEqual(f.effects,[]);assert.deepEqual(f.messages,[]);f.api.destroy();
});

test('E only activates a nearby target and leaves movement, repeat and composition events untouched',()=>{
  const f=fixture();f.near('office-coffee',2.31);
  assert.equal(f.doc.emit('keydown',{code:'KeyE',key:'e'}).prevented,false);assert.deepEqual(f.effects,[]);
  f.near('office-coffee',2.29);
  for(const value of [{code:'ArrowUp',key:'ArrowUp'},{code:'KeyW',key:'w'},{code:'Space',key:' '},{code:'KeyE',key:'e',repeat:true},{code:'KeyE',key:'e',isComposing:true}]){
    const event=f.doc.emit('keydown',value);assert.equal(event.prevented,false);assert.equal(event.stopped,false);
  }
  const nearby=f.doc.emit('keydown',{code:'KeyE',key:'e'});
  assert.deepEqual(f.effects,['office-coffee']);assert.equal(nearby.prevented,true);assert.equal(nearby.stopped,true);
  f.api.destroy();
});

test('interaction targets follow the current room and arcade scores stay local to the attached scene',()=>{
  const f=fixture();
  assert.equal(f.click(500,180).prevented,false);assert.deepEqual(f.effects,[]);
  f.setRoom('study');f.click(500,180);f.near('study-arcade');f.doc.emit('keydown',{code:'KeyE',key:'e'});
  assert.deepEqual(f.effects,['study-arcade','study-arcade']);
  assert.deepEqual(f.messages,['미니 아케이드 · 100점','미니 아케이드 · 200점']);
  assert.equal(f.click(100,80).prevented,false);f.api.destroy();
});

test('a renderer that declines an effect does not emit a success message or consume E',()=>{
  const f=fixture();f.near('office-coffee');f.office.triggerInteriorEffect=()=>false;
  const event=f.doc.emit('keydown',{code:'KeyE',key:'e'});
  assert.equal(event.prevented,false);assert.equal(event.stopped,false);assert.deepEqual(f.messages,[]);assert.equal(f.office.draws,0);f.api.destroy();
});

test('invalid projections and zero-size canvases do not create phantom targets',()=>{
  const f=fixture();
  f.projected.set('office-coffee',{x:NaN,y:80});f.projected.set('office-globe',{x:116,y:Infinity});
  assert.equal(f.click(100,80).prevented,false);
  f.office.canvas.getBoundingClientRect=()=>({left:100,top:50,width:0,height:0});
  assert.equal(f.click(650,300).prevented,false);assert.deepEqual(f.effects,[]);f.api.destroy();
});

test('hover affordances clear on pointer leave and destroy removes every owned listener',()=>{
  const f=fixture();f.root.emit('pointermove',f.client(100,80));
  assert.equal(f.root.style.cursor,'pointer');assert.equal(f.attributes.get('title'),'커피 한 잔 · 클릭');
  f.root.emit('pointerleave');assert.equal(f.root.style.cursor,'');assert.equal(f.attributes.has('title'),false);
  f.root.emit('pointermove',f.client(650,300));assert.equal(f.root.style.cursor,'pointer');
  f.api.destroy();f.api.destroy();
  assert.equal(f.root.style.cursor,'');assert.equal(f.attributes.has('title'),false);
  assert.equal(f.root.listeners.size,0);assert.equal(f.doc.listeners.size,0);
  f.click(100,80);f.near('office-coffee');f.doc.emit('keydown',{code:'KeyE',key:'e'});assert.deepEqual(f.effects,[]);
});
