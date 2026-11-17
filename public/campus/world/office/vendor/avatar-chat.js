/** Repeated history snapshots never replay old speech above avatars. */
export function createAvatarChat({clock=()=>Date.now(),scope=globalThis,onChange=()=>{},duration=7000}={}){
  const seen=new Set(),bubbles=new Map();
  let active=false,baseline=true,selfId=null,timer=null,destroyed=false;
  function schedule(){
    scope.clearTimeout(timer);timer=null;
    if(!bubbles.size||destroyed)return;
    const next=Math.min(...[...bubbles.values()].map(value=>value.until));
    timer=scope.setTimeout(()=>{
      for(const[id,value]of bubbles)if(value.until<=clock())bubbles.delete(id);
      onChange();schedule();
    },Math.max(1,next-clock()));
  }
  return{
    setRoom(room){const next=room==='study';if(next===active||destroyed)return;active=next;baseline=true;bubbles.clear();schedule();onChange();},
    receive({messages=[],selfId:ownId,status='connected'}={}){
      if(destroyed||!active||status!=='connected')return;
      selfId=ownId;const fresh=[];
      for(const entry of messages){
        if(!entry||typeof entry.id!=='string'||seen.has(entry.id))continue;
        seen.add(entry.id);if(!baseline)fresh.push(entry);
      }
      baseline=false;
      for(const entry of fresh){
        if(entry.channel==='staff')continue;
        const id=entry.participantId||entry.authorId;
        if(typeof id!=='string'||typeof entry.text!=='string'||!entry.text.trim())continue;
        bubbles.set(id,{text:entry.text.slice(0,280),role:entry.authorRole==='staff'?'staff':'student',until:clock()+duration});
      }
      if(seen.size>2000){seen.clear();for(const entry of messages)if(typeof entry?.id==='string')seen.add(entry.id);}
      if(fresh.length){schedule();onChange();}
    },
    speechFor(participant){
      if(!active||destroyed)return {text:'',role:'student'};
      const bubble=bubbles.get(participant==='self'?selfId:participant);
      return bubble&&bubble.until>clock()?{text:bubble.text,role:bubble.role}:{text:'',role:'student'};
    },
    textFor(participant){
      if(!active||destroyed)return '';
      const bubble=bubbles.get(participant==='self'?selfId:participant);
      return bubble&&bubble.until>clock()?bubble.text:'';
    },
    destroy(){destroyed=true;scope.clearTimeout(timer);bubbles.clear();seen.clear();},
  };
}

export function drawAvatarSpeech(ctx,{x,y,text,role='student'}){
  if(!text)return;
  ctx.save();ctx.font='400 13px LocalKR,system-ui,sans-serif';
  const rows=[];let row='';const chars=Array.from(text.replace(/\s+/g,' '));
  for(const char of chars){
    if(ctx.measureText(row+char).width>176&&row){rows.push(row);row='';}
    if(rows.length===3)break;row+=char;
  }
  if(row&&rows.length<3)rows.push(row);
  if(rows.join('').length<chars.join('').length&&rows.length)rows[rows.length-1]=rows.at(-1).slice(0,-1)+'…';
  const width=Math.max(48,...rows.map(line=>ctx.measureText(line).width+24)),height=rows.length*19+16;
  const left=x-width/2,top=y-47-height;
  ctx.fillStyle=role==='staff'?'#e9dcff':'#edf5fb';ctx.beginPath();ctx.roundRect(left,top,width,height,8);ctx.fill();
  ctx.beginPath();ctx.moveTo(x-5,top+height-1);ctx.lineTo(x,top+height+6);ctx.lineTo(x+5,top+height-1);ctx.closePath();ctx.fill();
  ctx.fillStyle=role==='staff'?'#432d62':'#163449';ctx.textAlign='center';ctx.textBaseline='middle';
  rows.forEach((line,index)=>ctx.fillText(line,x,top+17+index*19));ctx.restore();
}
