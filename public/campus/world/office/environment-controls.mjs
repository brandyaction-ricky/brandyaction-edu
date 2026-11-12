// Cosmetic preferences only. Membership and learning records remain in EDU.
export function attachEnvironmentControls({office,root,isBlocked=()=>false,wake=()=>{},onOpenChange=()=>{}}){
 const dialog=document.getElementById('environment-editor'),select=document.getElementById('lighting-select'),button=document.getElementById('environment-open');
 const key='moonshot-office-lighting-v1';
 function apply(value){if(!['bright','normal','night'].includes(value))return;select.value=value;wake();office.setEnvironment({lighting:value});}
 try{apply(localStorage.getItem(key));}catch{/* Optional device preference. */}
 function change(){apply(select.value);try{localStorage.setItem(key,select.value);}catch{}}
 function open(){if(dialog.open)return;office.pauseCampusInput();root.inert=true;dialog.showModal();onOpenChange(true);}
 function close(){onOpenChange(false);root.inert=isBlocked();if(!root.inert&&!document.hidden)office.resumeCampusInput();wake();}
 button.disabled=false;button.onclick=open;select.addEventListener('change',change);
 document.getElementById('environment-close').onclick=()=>dialog.close();dialog.addEventListener('close',close);
 return{open,isOpen:()=>dialog.open,destroy(){dialog.removeEventListener('close',close);select.removeEventListener('change',change);button.onclick=null;button.disabled=true;if(dialog.open)dialog.close();}};
}
