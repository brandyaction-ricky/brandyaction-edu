import {drawReaction,reactionText} from './reactions.mjs';
import {drawAvatarNameplate} from '../office/vendor/avatar-nameplate.js';
import {styleAvatarActor,avatarModelSignature,visitorAnimation} from '../office/vendor/avatar-appearance.js';
/** Original bundled characters at every distance. Bound count and animation work, never substitute bodies. */
export function attachCrowdRenderer(office,root){
 const limit=(matchMedia('(pointer:coarse)').matches||innerWidth<=600)?40:80,group=new office.room.constructor();office.scene.add(group);
 const actors=new Map();let figures=[],last=0;
 const profile=p=>({gender:p.gender==='female'?'female':'male',model:Number.isInteger(p.model)?p.model:0,coat:p.coat,hairColor:p.hair,skinColor:p.skin,pantsColor:p.pants,heldItem:p.heldItem||'none'});
 function sample(p,now){const t=Math.max(0,Math.min(1,(now-p.at)/1800));return{x:p.from.x+(p.x-p.from.x)*t,y:p.from.y+(p.y-p.from.y)*t,yaw:(p.from.yaw||0)+Math.atan2(Math.sin((p.yaw||0)-(p.from.yaw||0)),Math.cos((p.yaw||0)-(p.from.yaw||0)))*t};}
 function dispose(id){const actor=actors.get(id);if(actor)office.disposeVisitorActor(actor,group);actors.delete(id);}
 function clear(){figures=[];for(const id of actors.keys())dispose(id);root.dataset.crowdCount='0';}
 function set(list){const at=performance.now(),old=new Map(figures.map(p=>[p.id,p]));figures=[...list].sort((a,b)=>{const self=office.campusAvatar||{x:0,y:28};return(Math.hypot(a.x-self.x,a.y-self.y)-(old.has(a.id)?.8:0))-(Math.hypot(b.x-self.x,b.y-self.y)-(old.has(b.id)?.8:0));}).slice(0,limit).map(p=>({...p,from:old.has(p.id)?sample(old.get(p.id),at):p,at}));for(const id of actors.keys())if(!figures.some(p=>p.id===id))dispose(id);root.dataset.crowdCount=String(figures.length);root.dataset.crowdModel='original-avatar';draw(at);}
 function draw(now){if(document.hidden||root.inert||now-last<33)return;last=now;let created=0;for(const p of figures){
  const appearance=profile(p);let actor=actors.get(p.id);
  if(actor&&actor.appearanceKey!==avatarModelSignature(appearance)){dispose(p.id);actor=null;}
  if(!actor){if(created>=2||!office.chars?.length)continue;actor=office.createVisitorActor(appearance,group,'crowd:'+p.id);actors.set(p.id,actor);created++;actor.crowdAnimationAt=now;}
  styleAvatarActor(actor,appearance,(array,size)=>office.createAvatarAttribute(array,size));
  const pos=sample(p,now),walking=Math.hypot(p.x-p.from.x,p.y-p.from.y)>.02&&now-p.at<1800;
  actor.obj.visible=true;actor.obj.position.set(pos.x,office.campusHeightAt?.(pos.x,pos.y)||0,pos.y);actor.obj.rotation.y=pos.yaw||0;
  office.play(actor,visitorAnimation(appearance.heldItem,{moving:walking}));
  if(now-actor.crowdAnimationAt>=(walking?66:200)){actor.mixer.update(Math.min(.25,(now-actor.crowdAnimationAt)/1000));actor.crowdAnimationAt=now;}
  office.syncVisitorProp(actor,appearance.heldItem);
 }root.dataset.crowdActors=String(actors.size);}
 function labels(){root.dataset.peerReactions=JSON.stringify(figures.filter(p=>p.reaction?.expiresAt>Date.now()&&reactionText(p.reaction.code)).map(p=>p.reaction.code));if(root.inert)return;const self=office.campusAvatar||{x:0,y:0};let count=0;for(const p of [...figures].sort((a,b)=>Math.hypot(a.x-self.x,a.y-self.y)-Math.hypot(b.x-self.x,b.y-self.y))){if(!p.nickname||!actors.has(p.id)||Math.hypot(p.x-self.x,p.y-self.y)>18||count>=12)continue;const pos=sample(p,performance.now()),screen=office.projectInteriorPoint({x:pos.x-.05,y:pos.y-.05,w:.1,d:.1,height:1.9+(office.campusHeightAt?.(pos.x,pos.y)||0)});if(screen){drawAvatarNameplate(office.ctx,{x:screen.x,y:screen.y,name:p.nickname,level:0});if(p.reaction?.expiresAt>Date.now())drawReaction(office,pos,p.reaction.code);count++;}}root.dataset.crowdLabels=String(count);}
 return {set,clear,labels,tick:draw,moving:()=>figures.some(p=>p.reaction?.expiresAt>Date.now())||actors.size<figures.length||figures.some(p=>Math.hypot(p.x-p.from.x,p.y-p.from.y)>.02&&performance.now()-p.at<1800),destroy(){clear();group.removeFromParent();}};
}
