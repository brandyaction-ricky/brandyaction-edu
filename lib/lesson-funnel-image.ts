import { calculateFunnel, parseFunnelStages, type FunnelStage } from './lesson-calculators';

export async function downloadFunnelImage(input:FunnelStage[]):Promise<void>{
  const stages=calculateFunnel(parseFunnelStages(JSON.stringify(input)));
  await document.fonts.ready;
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('이미지를 만들지 못했습니다. 다시 시도해 주세요.');
  ctx.font='bold 14px sans-serif';
  function lines(text:string){
    const result:string[]=[];let line='';
    for(const char of text){if(char==='\n' || ctx!.measureText(line+char).width>170){result.push(line);line=char==='\n'?'':char;}else line+=char;}
    if(line || !result.length)result.push(line);return result;
  }
  const labels=stages.map(s=>lines(s.name || '단계')),heights=labels.map(label=>Math.max(100,label.length*20+55));
  const width=760,height=88+heights.reduce((sum,h)=>sum+h,0);
  // Bound output area on mobile while retaining every stage and wrapped label.
  const scale=Math.min(2,Math.sqrt(12_000_000/(width*height)),16000/height);
  canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);ctx.scale(scale,scale);
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#20242b';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 22px sans-serif';ctx.fillText('나의 마케팅 퍼널',width/2,35);
  let top=68;
  for(let i=0;i<stages.length;i++){
    const s=stages[i],h=heights[i],mid=top+h/2,cx=435,band=370;
    const upper=band*s.ratio,lower=band*(stages[i+1]?.ratio??s.ratio);
    ctx.beginPath();ctx.moveTo(cx-upper/2,top+8);ctx.lineTo(cx+upper/2,top+8);ctx.lineTo(cx+lower/2,top+h-8);ctx.lineTo(cx-lower/2,top+h-8);ctx.closePath();ctx.fillStyle=`rgba(26,171,223,${Math.max(.45,.9-i*.13)})`;ctx.fill();
    ctx.textAlign='right';ctx.fillStyle='#20242b';ctx.font='bold 14px sans-serif';
    labels[i].forEach((line,j)=>ctx.fillText(line,208,top+18+j*20));
    ctx.font='13px sans-serif';ctx.fillStyle='#596472';ctx.fillText(Math.round(s.number).toLocaleString('ko-KR'),208,top+labels[i].length*20+20);
    ctx.font='12px sans-serif';ctx.fillText(s.previous===null?'':`이전 대비 ${Math.round(s.previous*10)/10}%`,208,top+labels[i].length*20+39);
    ctx.font='bold 14px sans-serif';ctx.fillStyle='#20242b';ctx.fillText(s.overall===null?'계산 불가':`${Math.round(s.overall*10)/10}%`,width-20,mid);
    top+=h;
  }
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('이미지를 만들지 못했습니다. 다시 시도해 주세요.')),'image/png'));
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download='marketing-funnel.png';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
