export const RECORDED_AMBIENCE=Object.freeze({
  rain:'/campus/world/office/vendor/assets/audio/rain-house.m4a',
  office:'/campus/world/office/vendor/assets/audio/keyboard-og104.m4a',
});

/** Recorded audio streams independently, without decoding long source files into memory. */
export function createRecordedAmbience({scope=globalThis,onState=()=>{}}={}){
  const tracks=Object.fromEntries(Object.keys(RECORDED_AMBIENCE).map(id=>[id,{enabled:false,volume:25,audio:null,status:'off',generation:0}]));
  let room='office',destroyed=false;
  const supportsRoom=value=>value==='office'||value==='study';
  const active=t=>!destroyed&&supportsRoom(room)&&!scope.document?.hidden&&t.enabled&&t.volume>0;
  const getState=()=>Object.fromEntries(Object.entries(tracks).map(([id,t])=>[id,{enabled:t.enabled,volume:t.volume,status:t.status}]));
  const publish=()=>onState(getState());
  async function sync(id){
    const t=tracks[id],generation=++t.generation;
    if(!active(t)){t.audio?.pause();t.status=t.enabled?'paused':'off';publish();return;}
    try{
      if(!t.audio){t.audio=new scope.Audio(RECORDED_AMBIENCE[id]);t.audio.loop=true;t.audio.preload='none';}
      t.audio.volume=t.volume/100;t.status='loading';publish();
      await t.audio.play();
      if(!active(t)){t.audio.pause();return;}
      if(generation!==t.generation)return;
      t.status='playing';publish();
    }catch(error){
      if(generation!==t.generation||!active(t))return;
      t.status='error';t.enabled=false;t.audio?.pause();publish();throw error;
    }
  }
  const visibility=()=>{for(const id of Object.keys(tracks))void sync(id).catch(()=>{});};
  scope.document?.addEventListener('visibilitychange',visibility);
  return{
    getState,
    async setEnabled(id,enabled){if(!tracks[id])throw new Error('알 수 없는 배경음입니다.');if(destroyed)return;tracks[id].enabled=enabled===true;await sync(id);},
    setVolume(id,value){const t=tracks[id];if(!t||destroyed)return;const n=Number(value);if(!Number.isFinite(n))return;t.volume=Math.min(100,Math.max(0,n));if(t.audio)t.audio.volume=t.volume/100;if(t.volume===0||t.status==='paused')void sync(id).catch(()=>{});publish();},
    setRoom(next){if(destroyed||next===room)return;const wasSupported=supportsRoom(room);room=next;if(wasSupported===supportsRoom(next))return;for(const id of Object.keys(tracks))void sync(id).catch(()=>{});},
    destroy(){if(destroyed)return;destroyed=true;scope.document?.removeEventListener('visibilitychange',visibility);for(const t of Object.values(tracks)){t.enabled=false;t.generation++;if(t.audio){t.audio.pause();t.audio.removeAttribute('src');t.audio.load();t.audio=null;}t.status='off';}publish();},
  };
}
