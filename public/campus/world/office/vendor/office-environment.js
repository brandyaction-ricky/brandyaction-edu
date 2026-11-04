const ATTACHED=Symbol('office-environment');
const PRESETS=Object.freeze({
  bright:Object.freeze({exposure:1.12,sun:2.05,ambient:1.30,sunColor:0xe9f5ff,ambientColor:0xe4f4fa,
    ceiling:{color:0xe4f1ff,intensity:8,emissive:.35},task:{color:0xffdfb3,intensity:.6,emissive:.2},accent:{color:0x8bcff4,intensity:.35,emissive:.35}}),
  normal:Object.freeze({exposure:1.08,sun:.95,ambient:1.08,sunColor:0xd6ebf5,ambientColor:0xd7e7f0,
    ceiling:{color:0xffedd5,intensity:16,emissive:.8},task:{color:0xffcf91,intensity:2.4,emissive:1.1},accent:{color:0x91d5fa,intensity:1.2,emissive:.9}}),
  night:Object.freeze({exposure:1.07,sun:.22,ambient:.88,sunColor:0x8daed5,ambientColor:0xb3cbe3,
    ceiling:{color:0xffd6a3,intensity:7,emissive:.55},task:{color:0xffbd75,intensity:4.2,emissive:1.5},accent:{color:0x82bee9,intensity:2.2,emissive:1.2}}),
});

/** A stable outdoor scene and distinct practical indoor lighting in both campus rooms. */
export function attachOfficeEnvironment(office,root){
  if(office[ATTACHED])return office[ATTACHED].cleanup;
  const doc=root.ownerDocument||document,scope=doc.defaultView||globalThis;
  const backdrop=doc.createElement('div');backdrop.className='campus-backdrop';backdrop.setAttribute('aria-hidden','true');backdrop.inert=true;
  const backdropHost=root.closest?.('.workspace')||root;
  const originalPan=backdropHost.style?.getPropertyValue?.('--campus-pan-x')||'';
  backdropHost.insertBefore(backdrop,backdropHost.firstChild||null);
  const originalDraw=office.draw,originalDestroy=office.destroy,originalSetEnvironment=office.setEnvironment;
  const originalPaint=office.paintCampusExterior,originalExterior=office.campusExterior;
  const originalLighting=office.environmentLighting,originalPreset=office.environmentLightPreset;
  const originalDataset={lighting:root.dataset.lighting,scene:root.dataset.scene,weather:root.dataset.weather};
  const gl=office.gl,originalRender=gl?.render,baseExposure=gl?.toneMappingExposure??1.15,baseFilter=office.canvas?.style.filter||'';
  const lightOriginals=new Map(),materialOriginals=new Map();
  let environment={lighting:'bright'},destroyed=false;
  office.campusExterior={mode:'launch-axis-backdrop'};delete office.paintCampusExterior;

  function rememberLight(light){
    if(light&&!lightOriginals.has(light))lightOriginals.set(light,{intensity:light.intensity,visible:light.visible,color:light.color?.getHex?.()});
  }
  function rememberMaterial(material){
    if(material&&!materialOriginals.has(material))materialOriginals.set(material,{color:material.color?.getHex?.(),emissive:material.emissive?.getHex?.(),emissiveIntensity:material.emissiveIntensity});
  }
  function parentVisible(light){for(let node=light?.parent;node;node=node.parent)if(node.visible===false)return false;return true;}
  function syncBackdrop(){
    const room=office.getCampusVisibleRoom?.()||office.visibleCampusRoom?.()||'office';backdrop.hidden=!['office','study'].includes(room);return room;
  }
  function practicalSelection(entries,room){
    const mobile=office.compact===true||(Number(scope.innerWidth)>0&&scope.innerWidth<=600);
    const limits=mobile?{ceiling:1,task:2,accent:1}:{ceiling:2,task:4,accent:2};
    const chosen=new Set();
    for(const kind of ['ceiling','task','accent']){
      const candidates=entries.filter(entry=>entry.kind===kind&&entry.roomId===room&&entry.light&&parentVisible(entry.light));
      const count=Math.min(limits[kind],candidates.length);
      // Evenly sample rows so a light budget does not illuminate only one wing.
      for(let i=0;i<count;i++)chosen.add(candidates[Math.floor(i*candidates.length/count)]);
    }
    return chosen;
  }
  function applyLights(){
    const room=syncBackdrop(),preset=PRESETS[environment.lighting];
    office.environmentLighting=environment.lighting;office.environmentLightPreset=preset;
    // The flat renderer draws its own lamp pools; a whole-canvas dark filter hides those pools.
    if(!gl){if(office.canvas)office.canvas.style.filter=baseFilter;return;}
    gl.toneMappingExposure=baseExposure*preset.exposure;
    for(const [light,intensity,color]of [[office.sun,preset.sun,preset.sunColor],[office.hemi,preset.ambient,preset.ambientColor]]){
      if(!light)continue;rememberLight(light);light.intensity=intensity;light.color?.setHex(color);
    }
    const entries=Array.isArray(office.campusPracticalLights)?office.campusPracticalLights:[],chosen=practicalSelection(entries,room);
    for(const entry of entries){
      const settings=preset[entry.kind]||preset.accent,visible=entry.roomId===room;
      const color=entry.tone==='warm'?preset.task.color:settings.color;
      if(entry.light){rememberLight(entry.light);entry.light.visible=visible&&chosen.has(entry);entry.light.intensity=entry.light.visible?settings.intensity:0;entry.light.color?.setHex(color);}
      for(const bulb of entry.bulbs||[]){
        for(const material of (Array.isArray(bulb.material)?bulb.material:[bulb.material])){
          if(!material)continue;rememberMaterial(material);
          if(material.emissive){material.emissive.setHex(color);material.emissiveIntensity=visible?settings.emissive:0;}
          else if(visible)material.color?.setHex(color);
        }
      }
    }
    // Legacy scene fixtures are secondary only when no room-specific lighting is installed.
    for(const light of [office.lampLight,...(office.pendants||[])]){
      if(!light||entries.some(entry=>entry.light===light))continue;rememberLight(light);
      const visible=entries.length===0&&parentVisible(light);light.visible=visible;light.intensity=visible?(environment.lighting==='night'?2.4:environment.lighting==='normal'?1.2:.35):0;
    }
    if(office.windowMat){rememberMaterial(office.windowMat);office.windowMat.color?.setHex(environment.lighting==='night'?0x8aafc8:0xb6d9e7);office.windowMat.emissive?.setHex(0x000000);}
  }
  if(originalRender)gl.render=function(...args){applyLights();return originalRender.apply(this,args);};
  office.draw=function(...args){syncBackdrop();if(!gl)applyLights();return originalDraw.apply(this,args);};
  office.setEnvironment=value=>{
    if(destroyed||!value||!Object.hasOwn(PRESETS,value.lighting))return;
    environment={lighting:value.lighting};root.dataset.lighting=environment.lighting;root.dataset.scene='earth-research-laboratory';delete root.dataset.weather;
    applyLights();if(office.visible!==false)office.draw();
  };
  function cleanup(){
    if(destroyed)return;destroyed=true;
    if(gl&&originalRender){gl.render=originalRender;gl.toneMappingExposure=baseExposure;}
    for(const [light,saved]of lightOriginals){light.intensity=saved.intensity;light.visible=saved.visible;if(saved.color!==undefined)light.color?.setHex(saved.color);}
    for(const [material,saved]of materialOriginals){if(saved.color!==undefined)material.color?.setHex(saved.color);if(saved.emissive!==undefined)material.emissive?.setHex(saved.emissive);if(saved.emissiveIntensity!==undefined)material.emissiveIntensity=saved.emissiveIntensity;}
    office.draw=originalDraw;office.destroy=originalDestroy;
    for(const [key,value]of Object.entries({paintCampusExterior:originalPaint,campusExterior:originalExterior,setEnvironment:originalSetEnvironment,environmentLighting:originalLighting,environmentLightPreset:originalPreset})){if(value===undefined)delete office[key];else office[key]=value;}
    for(const[key,value]of Object.entries(originalDataset)){if(value===undefined)delete root.dataset[key];else root.dataset[key]=value;}
    if(office.canvas)office.canvas.style.filter=baseFilter;backdrop.remove();
    if(originalPan)backdropHost.style?.setProperty?.('--campus-pan-x',originalPan);else backdropHost.style?.removeProperty?.('--campus-pan-x');
    lightOriginals.clear();materialOriginals.clear();delete office[ATTACHED];
  }
  office.destroy=function(...args){cleanup();return originalDestroy.apply(this,args);};
  office[ATTACHED]={cleanup};office.setEnvironment(environment);return cleanup;
}
