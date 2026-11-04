// Scene/HUD gestures stay inside the scene. Native form editing remains available.
export function attachSceneTouchGuard(doc) {
 const editable = target => target instanceof doc.defaultView.Element && !!target.closest('dialog,input,textarea,select,[contenteditable="true"]');
 const stopMenu = e => {if(!editable(e.target))e.preventDefault();};
 const stopDrag = e => {
  if(editable(e.target))return;
  // Expanded reaction/chat lists may scroll vertically; the scene itself never scrolls.
  if(e.target.closest('.visitor-stories,.meetup-body'))return;
  if(e.cancelable)e.preventDefault();
 };
 const edgeStart = e => {
  if(editable(e.target)||e.target.closest('button,a,.visitor-stories,.meetup-body')||e.touches.length!==1)return;
  const x=e.touches[0].clientX;
  if((x<24||x>doc.defaultView.innerWidth-24)&&e.cancelable)e.preventDefault();
 };
 doc.addEventListener('contextmenu',stopMenu);
 doc.addEventListener('selectstart',stopMenu);
 doc.addEventListener('touchmove',stopDrag,{passive:false});
 doc.addEventListener('touchstart',edgeStart,{passive:false});
 return ()=>{doc.removeEventListener('contextmenu',stopMenu);doc.removeEventListener('selectstart',stopMenu);doc.removeEventListener('touchmove',stopDrag);doc.removeEventListener('touchstart',edgeStart);};
}
