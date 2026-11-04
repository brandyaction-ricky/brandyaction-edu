import {appearance} from './contract.mjs';

/** Uses the handoff's actual GLB actors, palette shader and preview camera. */
export function attachAppearanceEditor(office,send){
 const dialog=document.getElementById('appearance-editor'),form=dialog.querySelector('form'),host=document.getElementById('avatar-preview');
 const error=document.getElementById('appearance-error'),save=document.getElementById('appearance-save');
 let preview=null,saving=false,lastFocus=null;
 const read=()=>({...appearance(Object.fromEntries(new FormData(form))),model:Number(form.elements.model.value),nickname:form.elements.nickname.value.trim().slice(0,24)});
 function paint(){const value=read();document.getElementById('avatar-name').textContent=value.nickname||'문샷 동료';preview?.update({...value,displayId:value.nickname});host.dataset.model=value.gender+':'+value.model;host.dataset.colors=JSON.stringify([value.hairColor,value.skinColor,value.coat,value.pantsColor]);host.dataset.heldItem=value.heldItem;}
 function showPreview(){preview?.destroy();preview=office.createAvatarPreview(host,{reduceMotion:true});paint();}
 function restore(){preview?.destroy();preview=null;office.setVisible(!document.hidden);office.resumeCampusInput();lastFocus?.focus?.();}
 function close(cancel){if(saving)return;if(cancel)send('appearance-cancel');dialog.close();restore();}
 function open(){if(dialog.open)return;lastFocus=document.activeElement;const value={...appearance(office.campusIdentity),nickname:office.campusIdentity?.displayId||'문샷 동료'};
  for(const[k,v]of Object.entries(value))if(form.elements[k])form.elements[k].value=String(v);
  saving=false;save.disabled=false;error.textContent='';dialog.showModal();office.pauseCampusInput();office.setVisible(false);showPreview();form.elements.nickname.focus();
 }
 form.addEventListener('input',()=>{paint();send('appearance-draft',read());error.textContent='';});
 const submit=event=>{event.preventDefault();if(saving||!form.reportValidity())return;const value=read();if(!value.nickname){error.textContent='닉네임을 입력해 주세요.';return;}saving=true;save.disabled=true;error.textContent='저장하고 있어요.';send('appearance-save',value);};
 save.addEventListener('click',submit);
 form.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.tagName==='INPUT')submit(event);});
 form.addEventListener('submit',event=>event.preventDefault());
 dialog.addEventListener('cancel',event=>{event.preventDefault();close(true);});
 document.getElementById('appearance-cancel').onclick=()=>close(true);
 const visibility=()=>{if(!dialog.open)return;if(document.hidden){preview?.destroy();preview=null;}else{office.setVisible(false);showPreview();}};
 document.addEventListener('visibilitychange',visibility);
 return {open,result(value){if(!dialog.open)return;saving=false;save.disabled=false;if(value.ok){error.textContent='';close(false);}else error.textContent=String(value.error||'저장하지 못했어요. 다시 시도해 주세요.');},destroy(){preview?.destroy();document.removeEventListener('visibilitychange',visibility);}};
}
