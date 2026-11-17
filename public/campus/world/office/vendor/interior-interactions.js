import {getInteriorInteractionTargets} from './interior-layout.js';

/** The world objects are the controls; no extra toolbars or public chat messages. */
export function attachInteriorInteractions({office,root,onMessage=()=>{},getRoom=()=>office.getCampusVisibleRoom?.()||'office'}={}){
  const doc=root.ownerDocument||document,listeners=[];
  let down=null,destroyed=false,arcadeScore=0,hovered=null;
  const listen=(target,type,handler,options)=>{target.addEventListener(type,handler,options);listeners.push(()=>target.removeEventListener(type,handler,options));};
  const isControl=target=>target?.closest?.('button,a,input,textarea,select,summary,[contenteditable]');
  const available=()=>!destroyed&&!root.inert&&!office.campusStudyLocked&&!doc.hidden;
  const targets=()=>getInteriorInteractionTargets(getRoom());
  function hitAt(event){
    const bounds=(office.canvas||root).getBoundingClientRect();
    if(!bounds.width||!bounds.height)return null;
    const x=(event.clientX-bounds.left)*(office.cw||bounds.width)/bounds.width,y=(event.clientY-bounds.top)*(office.ch||bounds.height)/bounds.height;
    if(typeof office.pickInteriorAt==='function'){const id=office.pickInteriorAt(x,y);return targets().find(item=>item.id===id)||null;}
    let chosen=null,best=Infinity;
    for(const item of targets()){
      const point=office.projectInteriorPoint?.(item);
      if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))continue;
      const distance=Math.hypot(x-point.x,y-point.y),radius=Math.min(48,Math.max(18,point.radius||24));
      if(distance<=radius&&distance<best){chosen=item;best=distance;}
    }
    return chosen;
  }
  function activate(item){
    if(!item||!available())return false;
    if(office.triggerInteriorEffect?.(item.id)===false)return false;
    const messages={coffee:'커피 한 잔, 준비됐습니다.',water:'식물에 물을 줬습니다.',rocket:'3, 2, 1. 미니 로켓 발사!',telescope:'달을 향해 망원경을 맞췄습니다.',globe:'작은 지구를 한 바퀴 돌려봅니다.'};
    if(item.interactive==='arcade')arcadeScore+=100;
    onMessage(item.interactive==='arcade'?'미니 아케이드 · '+arcadeScore+'점':messages[item.interactive]||item.name);
    office.draw?.();return true;
  }
  listen(root,'pointerdown',event=>{down={x:event.clientX,y:event.clientY};},true);
  listen(root,'pointermove',event=>{
    const item=available()&&!isControl(event.target)?hitAt(event):null;
    if(item?.id===hovered?.id)return;
    hovered=item;root.style.cursor=item?'pointer':'';
    if(item){root.setAttribute('title',item.name+' · 클릭');root.setAttribute('data-interior-hover',item.id);}else{root.removeAttribute('title');root.removeAttribute('data-interior-hover');}
  },true);
  listen(root,'pointerleave',()=>{hovered=null;root.style.cursor='';root.removeAttribute('title');root.removeAttribute('data-interior-hover');},true);
  listen(root,'click',event=>{
    if(!available()||isControl(event.target)||down&&Math.hypot(event.clientX-down.x,event.clientY-down.y)>8)return;
    const item=hitAt(event);if(!item)return;
    event.preventDefault();event.stopImmediatePropagation();activate(item);
  },true);
  listen(doc,'keydown',event=>{
    if(event.repeat||event.isComposing||!(event.code==='KeyE'||event.key?.toLowerCase()==='e')||!available()||isControl(event.target))return;
    const avatar=office.campusAvatar;if(!avatar)return;
    const nearby=targets().map(item=>({item,distance:Math.hypot(avatar.x-item.center.x,avatar.y-item.center.y)})).filter(value=>value.distance<=2.3).sort((a,b)=>a.distance-b.distance)[0];
    if(nearby&&activate(nearby.item)){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  return{destroy(){if(destroyed)return;destroyed=true;listeners.forEach(remove=>remove());root.style.cursor='';root.removeAttribute('title');root.removeAttribute('data-interior-hover');}};
}
