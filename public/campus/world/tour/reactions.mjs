/** Only an explicit visitor click sends one of these presets. Never simulated testimonials. */
export const REACTIONS=Object.freeze([
 {id:'hello',text:'👋 안녕하세요'}, {id:'nice',text:'😊 반가워요'},
 {id:'together',text:'🤝 함께해요'}, {id:'cheer',text:'🙌 응원해요'},
 {id:'thanks',text:'💙 감사해요'}, {id:'moonshot',text:'🚀 문샷 좋아요'},
 {id:'wave',text:'👋'}, {id:'heart',text:'💙'}
]);
export const REACTION_TTL=4500, REACTION_COOLDOWN=2500;
export function reactionText(code){return REACTIONS.find(r=>r.id===code)?.text||'';}
export function drawReaction(office,position,code){
 const text=reactionText(code);if(!text)return false;
 const p=office.projectInteriorPoint({x:position.x-.05,y:position.y-.05,w:.1,d:.1,height:2.8+(office.campusHeightAt?.(position.x,position.y)||0)});if(!p)return false;
 const ctx=office.ctx;ctx.save();ctx.font='600 14px LocalKR,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
 const width=ctx.measureText(text).width+28,x=Math.min(Math.max(width/2+8,p.x),office.canvas?.clientWidth?office.canvas.clientWidth-width/2-8:p.x),y=Math.max(22,p.y);
 ctx.shadowColor='#00132755';ctx.shadowBlur=12;ctx.fillStyle='#f4f8ff';ctx.beginPath();ctx.roundRect(x-width/2,y-20,width,36,12);ctx.fill();ctx.shadowBlur=0;
 ctx.beginPath();ctx.moveTo(x-6,y+14);ctx.lineTo(x,y+23);ctx.lineTo(x+6,y+14);ctx.fill();ctx.fillStyle='#12304c';ctx.fillText(text,x,y-2);ctx.restore();return true;
}
