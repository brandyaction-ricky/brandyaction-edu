// Entirely procedural audio. No remote audio files, autoplay, microphone, or licensed recordings.
export type AmbientKind='wind'|'rain'|'ship';
export type AmbientAudio={volume:(value:number)=>void;stop:()=>Promise<void>};
export async function createAmbient(kind:AmbientKind,volume:number):Promise<AmbientAudio>{
 const ctx=new AudioContext();const gain=ctx.createGain();gain.gain.value=0;gain.connect(ctx.destination);
 const sources:AudioScheduledSourceNode[]=[];
 if(kind==='ship'){
  for(const [hz,level] of [[75,.12],[150,.035],[225,.015]]){const oscillator=ctx.createOscillator(),part=ctx.createGain();oscillator.type='sine';oscillator.frequency.value=hz;part.gain.value=level;oscillator.connect(part);part.connect(gain);oscillator.start();sources.push(oscillator);}
 }else{
  const buffer=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate),data=buffer.getChannelData(0);let last=0;
  for(let i=0;i<data.length;i++){const random=Math.random()*2-1;last=(last+.025*random)/1.025;data[i]=kind==='wind'?last*2:random*.12;}
  const noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter();noise.buffer=buffer;noise.loop=true;filter.type=kind==='wind'?'lowpass':'highpass';filter.frequency.value=kind==='wind'?500:900;noise.connect(filter);filter.connect(gain);noise.start();sources.push(noise);
 }
 await ctx.resume();
 const set=(value:number)=>gain.gain.setTargetAtTime(Math.max(0,Math.min(100,value))/100,ctx.currentTime,.15);set(volume);
 return {volume:set,async stop(){for(const source of sources)source.stop();await ctx.close();}};
}
