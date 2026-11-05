/** Fit Korean and Latin glyphs by measured width, never by character count. */
export function fitSignFont(ctx,text,maxWidth,start,font='system-ui, sans-serif'){
 let size=start;ctx.font=`600 ${size}px ${font}`;
 while(size>8&&ctx.measureText(text).width>maxWidth){size--;ctx.font=`600 ${size}px ${font}`;}
 return size;
}
export function paintLibrarySign(canvas,{eyebrow='MOONSHOT LIBRARY',title,subtitle='',play=false}){
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,pad=w*.085;
 ctx.fillStyle='#10253b';ctx.fillRect(0,0,w,h);
 ctx.strokeStyle='#38516c';ctx.lineWidth=2;ctx.strokeRect(1,1,w-2,h-2);
 ctx.fillStyle='#558fff';ctx.fillRect(pad,h*.13,w*.07,3);
 ctx.textAlign='left';ctx.textBaseline='middle';
 const line=(text,y,size,color)=>{fitSignFont(ctx,text,w-pad*2,size);ctx.fillStyle=color;ctx.fillText(text,pad,y);};
 line(eyebrow,h*.25,Math.min(24,h*.1),'#8eb5df');
 line(title,h*.49,Math.min(58,h*.21),'#f5f8ff');
 line(subtitle,h*.75,Math.min(28,h*.12),'#bfd0e0');
 if(play){const r=Math.min(w*.035,h*.06),x=w-pad-r,y=h*.25;ctx.fillStyle='#79aaff';ctx.beginPath();ctx.moveTo(x-r*.5,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x-r*.5,y+r);ctx.closePath();ctx.fill();}
}
