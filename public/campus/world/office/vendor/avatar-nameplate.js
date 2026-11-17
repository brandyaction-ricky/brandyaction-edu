/** The same two-line label is used by the 2D and 3D campus renderers. */
export function drawAvatarNameplate(ctx,{x,y,name='나',level=0,self=false}){
  const value=Number.isInteger(level)?Math.max(0,Math.min(30,level)):0;
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='600 11px LocalKR,system-ui,sans-serif';
  const chars=Array.from(String(name));let text=chars.join('');
  while(ctx.measureText(text).width>142&&chars.length>1){chars.pop();text=chars.join('')+'…';}
  const width=Math.max(38,ctx.measureText(text).width+18),height=21;
  ctx.fillStyle=self?'rgba(10,31,47,.94)':'rgba(24,48,64,.92)';
  ctx.strokeStyle=self?'#91d5fa':'#6c9bad';ctx.lineWidth=1;
  ctx.beginPath();ctx.roundRect(x-width/2,y-14,width,height,5);ctx.fill();ctx.stroke();
  ctx.fillStyle='#e0f2fc';ctx.fillText(text,x,y-3);
  ctx.font='700 10px LocalKR,system-ui,sans-serif';
  const label=value+'lv',badgeWidth=Math.max(34,ctx.measureText(label).width+14);
  ctx.fillStyle=self?'#91d5fa':'#b3d9ee';
  ctx.beginPath();ctx.roundRect(x-badgeWidth/2,y-35,badgeWidth,17,5);ctx.fill();
  ctx.fillStyle='#12364d';ctx.fillText(label,x,y-26);
  ctx.restore();
  return{x0:x-width/2,x1:x+width/2,y0:y-35,y1:y+7};
}
