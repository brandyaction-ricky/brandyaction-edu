/** Cosmetic data only. These values never contain employee or office records. */
export const APPEARANCE_OPTIONS=Object.freeze({
  hairStyle:[{value:'short',label:'짧은 머리'},{value:'bob',label:'단발'},{value:'bun',label:'묶은 머리'},{value:'side',label:'옆으로 넘긴 머리'}],
  hairColor:['#302825','#704730','#b88950','#dbd3c4','#673f76','#455d78'],
  skinColor:['#f4d2b2','#e8b68b','#c78e63','#9c6748','#714b37'],
  coat:['#8bcff4','#faf4e7','#354f6b','#7b9478','#d9a0a4','#967bb2'],
  pantsColor:['#36485d','#56515c','#a38c76','#253447'],
});
const validHex=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
export function appearanceValues(profile={}){
  const seed=Number(profile.appearanceSeed)||0, styles=['short','bob','bun','side'];
  return {
    hairStyle:styles.includes(profile.hairStyle)?styles.indexOf(profile.hairStyle):profile.gender==='female'?1:profile.gender==='male'?0:seed%4,
    hair:validHex(profile.hairColor)?profile.hairColor:'#302825',
    skin:validHex(profile.skinColor)?profile.skinColor:'#e8b68b',
    pants:validHex(profile.pantsColor)?profile.pantsColor:'#36485d',
    shirt:validHex(profile.coat)?profile.coat:'#8bcff4',
  };
}
/** Explicit model selection wins over legacy hairstyle presets. */
export function resolveAvatarModel(profile={}){
  const styles=['short','bob','bun','side'],seed=Number(profile.appearanceSeed)||0;
  const style=styles.includes(profile.hairStyle)?styles.indexOf(profile.hairStyle):profile.gender==='female'?1:profile.gender==='male'?0:seed%4;
  const gender=profile.gender==='female'?'female':profile.gender==='male'?'male':style===1||style===2?'female':'male';
  const model=Number.isInteger(profile.model)&&profile.model>=0&&profile.model<=5?profile.model:[0,1,4,3][style];
  return{gender,model};
}
export function getAvatarModelIndex(profile={}){const value=resolveAvatarModel(profile);return value.model+(value.gender==='female'?6:0);}
export function avatarModelSignature(profile={}){const value=resolveAvatarModel(profile);return value.gender+':'+value.model;}
export function visitorAnimation(heldItem,{moving=false,pose}={}){return moving?'walk':pose==='sit'?'sit':pose==='wave'?'emote-yes':heldItem==='coffee'?'holding-right':heldItem==='book'?'holding-both':'idle';}
const rgb=hex=>{const n=parseInt(hex.slice(1),16);const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;return {r:linear((n>>16)/255),g:linear((n>>8&255)/255),b:linear((n&255)/255)};};
// UV columns verified against all twelve bundled, meshopt-decoded GLB heads.
const SKIN_COLUMNS=[.84375,.96875,.96875,.96875,.96875,.71875,.84375,.96875,.71875,.96875,.96875,.96875];
const HAIR_COLUMNS=[.09375,.71875,.71875,.71875,.84375,.09375,.09375,.71875,.21875,.71875,.09375,.84375];
export function getAvatarPaletteColumns(profile={}){const index=getAvatarModelIndex(profile);return{skin:SKIN_COLUMNS[index],hair:HAIR_COLUMNS[index]};}
const key=profile=>JSON.stringify([getAvatarModelIndex(profile),...['coat','hairColor','skinColor','pantsColor'].map(k=>profile?.[k]??'')]);

/** Tint only each cloned visitor's materials. Shared employee models stay untouched. */
export function styleAvatarActor(actor,profile={},createAttribute){
  if(!actor?.obj)return;const signature=key(profile);if(actor.cosmeticKey===signature)return;
  const values=appearanceValues(profile);
  const columns=getAvatarPaletteColumns(profile);
  actor.obj.traverse(node=>{
    if(!node.isSkinnedMesh)return;
    const head=String(node.name).includes('head');
    if(!head&&!String(node.name).includes('body'))return;
    if(!head&&!node.geometry?.attributes?.avatarPartMask){
      const indices=node.geometry?.attributes?.skinIndex,weights=node.geometry?.attributes?.skinWeight;
      if(!indices||!weights)return;
      const bones=node.skeleton?.bones||[],mask=new Float32Array(indices.count*3), getters=['getX','getY','getZ','getW'];
      for(let i=0;i<indices.count;i++)for(let j=0;j<4;j++){
        const name=bones[indices[getters[j]](i)]?.name||'',w=weights[getters[j]](i);
        if(name==='torso')mask[i*3]+=w;
        else if(name.startsWith('leg'))mask[i*3+1]+=w;
        else if(name.startsWith('arm'))mask[i*3+2]+=w;
      }
      if(!node.userData.campusOwnGeometry){node.geometry=node.geometry.clone();node.userData.campusOwnGeometry=true;}
      // Loader attributes can expose a typed-array constructor. A typed array
      // lacks BufferAttribute.array and crashes WebGLAttributes on the next draw.
      if(typeof createAttribute!=='function')throw new Error('캐릭터 색상 속성을 만들 수 없습니다.');
      const attribute=createAttribute(mask,3);
      if(!attribute?.isBufferAttribute||attribute.array!==mask||attribute.itemSize!==3)throw new Error('캐릭터 색상 속성 형식을 확인해 주세요.');
      node.geometry.setAttribute('avatarPartMask',attribute);
    }
    const customize=original=>{
      const existing=original.userData?.avatarPalette;
      if(existing){
        for(const[field,color]of Object.entries({Hair:values.hair,Skin:values.skin,Pants:values.pants,Shirt:values.shirt}))Object.assign(existing[field].value,rgb(color));
        existing.SkinU.value=columns.skin;existing.HairU.value=columns.hair;
        return original;
      }
      const material=original.userData?.campusOwnMaterial?original:original.clone();
      material.userData.campusOwnMaterial=true;
      const palette=Object.fromEntries(Object.entries({Hair:values.hair,Skin:values.skin,Pants:values.pants,Shirt:values.shirt}).map(([field,color])=>[field,{value:rgb(color)}]));
      palette.SkinU={value:columns.skin};palette.HairU={value:columns.hair};
      material.userData.avatarPalette=palette;
      material.onBeforeCompile=shader=>{
        for(const[field,uniform]of Object.entries(palette))shader.uniforms['avatar'+field]=uniform;
        shader.fragmentShader='uniform vec3 avatarHair; uniform vec3 avatarSkin; uniform vec3 avatarPants; uniform vec3 avatarShirt; uniform float avatarSkinU; uniform float avatarHairU;\n'+shader.fragmentShader;
        if(head){
          shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
            vec3 originalAvatarColor=diffuseColor.rgb;
            float avatarLight=dot(originalAvatarColor,vec3(.2126,.7152,.0722));
            bool skinPixel=abs(vMapUv.x-avatarSkinU)<.012 && vMapUv.y>.75;
            bool hairPixel=abs(vMapUv.x-avatarHairU)<.012 && vMapUv.y>.75;
            if(skinPixel) diffuseColor.rgb=avatarSkin;
            else if(hairPixel && avatarLight>.008) diffuseColor.rgb=avatarHair;
          `);
        }else{
          shader.vertexShader='attribute vec3 avatarPartMask; varying vec3 vAvatarParts;\n'+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvAvatarParts=avatarPartMask;');
          shader.fragmentShader='varying vec3 vAvatarParts;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,avatarShirt,clamp(vAvatarParts.x,0.,1.));\ndiffuseColor.rgb=mix(diffuseColor.rgb,avatarPants,clamp(vAvatarParts.y,0.,1.));\ndiffuseColor.rgb=mix(diffuseColor.rgb,avatarSkin,clamp(vAvatarParts.z,0.,1.));');
        }
      };
      material.customProgramCacheKey=()=>head?'avatar-head-palette-v3':'avatar-body-palette-v2';
      material.needsUpdate=true;return material;
    };
    node.material=Array.isArray(node.material)?node.material.map(customize):customize(node.material);
  });
  actor.cosmeticKey=signature;
}

const ATTACHED=Symbol('avatar-appearance');
export function attachAvatarAppearance(office){
  if(!office||office[ATTACHED])return office?.[ATTACHED]?.destroy||(()=>{});
  const original=office.renderCampusAvatar, originalActor=office.actorFor, originalCompanions=office.renderStudyCompanions;
  const is3D=typeof original==='function'&&typeof originalActor==='function';
  if(is3D){
    office.actorFor=function(person){
      const profile=person.key==='campus:self'?this.campusIdentity:(this.studyCompanions||[]).find(p=>person.key==='study:participant:'+p.id);
      if(profile){
        person.h=getAvatarModelIndex(profile);
      }
      return originalActor.call(this,person);
    };
    office.renderCampusAvatar=function(dt){
      const p=this.campusIdentity||{};
      original.call(this,dt);styleAvatarActor(this.campusAvatarMesh,p,(array,itemSize)=>this.createAvatarAttribute(array,itemSize));
    };
    if(typeof originalCompanions==='function')office.renderStudyCompanions=function(dt){
      originalCompanions.call(this,dt);
      for(const p of this.studyCompanions||[])styleAvatarActor(this.studyCompanionActors?.get(p.id),p,(array,itemSize)=>this.createAvatarAttribute(array,itemSize));
    };
  }
  const destroy=()=>{if(is3D){office.actorFor=originalActor;office.renderCampusAvatar=original;if(originalCompanions)office.renderStudyCompanions=originalCompanions;}delete office[ATTACHED];};
  office[ATTACHED]={destroy};return destroy;
}
if(typeof window!=='undefined')window.OfficeAppearance={appearanceValues,styleAvatarActor,resolveAvatarModel,getAvatarModelIndex,avatarModelSignature,visitorAnimation,getAvatarPaletteColumns};
