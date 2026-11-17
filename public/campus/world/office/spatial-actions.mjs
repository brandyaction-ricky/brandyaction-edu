import {getStudyDesks,getStudyBookcase} from './vendor/campus-plan.js';
import {getCampusInterior} from './vendor/interior-layout.js';
/** DOM labels are projected from real furniture, not fixed screen percentages. */
export function attachSpatialActions({office,root,onAction,isClosed=()=>false}){
 const layer=document.createElement('nav');layer.className='space-actions';layer.setAttribute('aria-label','공간 안에서 할 일');root.append(layer);
 const furniture=id=>getCampusInterior('study').find(item=>item.id===id);
 const desk=getStudyDesks()[0],books=getStudyBookcase();
 const targets=[
  {id:'desk',label:'집중하기',hint:'책상에 앉아 시작',item:{...desk,w:2.8,d:1,height:1}},
  {id:'mission',label:'수업·과제',hint:'오늘 할 일 확인',item:{x:books.x,y:books.y,w:books.width,d:.6,height:2}},
  {id:'board',label:'결과물 나누기',hint:'동료에게 의견 받기',item:furniture('study-low-shelf')},
  {id:'chat',label:'동료와 대화',hint:'소파에서 한마디',item:furniture('study-lounge-sofa')},
  {id:'terrace',label:'잠깐 쉬기',hint:'소리와 휴식 타이머',item:furniture('study-terrace-table')},
 ];
 const controls=targets.map(target=>{const button=document.createElement('button');button.className='space-action';button.dataset.action=target.id;button.innerHTML='<span class="action-dot" aria-hidden="true"></span><strong></strong><small></small>';button.querySelector('strong').textContent=target.label;button.querySelector('small').textContent=target.hint;button.setAttribute('aria-label',target.label);button.addEventListener('click',event=>{event.stopPropagation();if(!isClosed(target.id))onAction(target.id);});layer.append(button);return{...target,button,previous:''};});
 const original=office.draw;
 function update(){const show=office.getCampusRoom?.()==='study'&&!root.inert;layer.hidden=!show;if(!show)return;for(const entry of controls){const p=office.projectInteriorPoint(entry.item);entry.button.hidden=!p;entry.button.disabled=isClosed(entry.id);if(p){const transform=`translate(${Math.round(p.x)}px,${Math.round(p.y-22)}px) translate(-50%,-100%)`;if(entry.previous!==transform){entry.button.style.transform=transform;entry.previous=transform;}}}}
 office.draw=function(...args){const result=original.apply(this,args);update();return result;};update();
 return{update,destroy(){office.draw=original;layer.remove();}};
}
