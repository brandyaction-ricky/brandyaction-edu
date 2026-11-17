/** Merge static geometry with identical materials, preserving every vertex/normal/UV.
 * Generated atrium meshes retain BoxGeometry.type after replacing their vertices;
 * never infer their shape from geometry.type or geometry.parameters.
 */
export function batchAtriumBoxes(group){
 group.updateMatrixWorld(true);
 const buckets=new Map(),batches=[],materialKeys=new Map();
 group.traverse(mesh=>{
  const m=mesh.material,g=mesh.geometry;
  if(!mesh.isMesh||mesh.isSkinnedMesh||mesh.isInstancedMesh||!g?.attributes?.position||!mesh.visible||mesh.userData.campusDynamicMaterial||!m||Array.isArray(m)||m.type!=='MeshStandardMaterial'||m.transparent||Object.keys(g.morphAttributes||{}).length)return;
  const attributes=Object.keys(g.attributes).sort();if(attributes.some(k=>g.attributes[k].isInterleavedBufferAttribute))return;
  if(!materialKeys.has(m.uuid)){
   // Avoid material.toJSON(): it serializes texture canvases to PNG during entry.
   const material=Object.keys(m).sort().filter(k=>!['id','uuid','name','version','userData'].includes(k)).map(k=>{const v=m[k];return[k,v?.isTexture?v.uuid:v?.isColor?[v.r,v.g,v.b]:v?.isVector2?[v.x,v.y]:v===null||['string','number','boolean'].includes(typeof v)?v:undefined];});
   materialKeys.set(m.uuid,JSON.stringify(material));
  }
  const key=JSON.stringify([materialKeys.get(m.uuid),attributes.map(k=>[k,g.attributes[k].itemSize,g.attributes[k].normalized,g.attributes[k].array.constructor.name]),mesh.castShadow,mesh.receiveShadow]);
  if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(mesh);
 });
 const inverse=group.matrixWorld.clone().invert();let removed=0;
 for(const meshes of buckets.values()){
  if(meshes.length<2)continue;
  const first=meshes[0],geometry=first.geometry.clone();for(const name of Object.keys(geometry.attributes))geometry.deleteAttribute(name);geometry.clearGroups();
  const copies=meshes.map(mesh=>mesh.geometry.clone().applyMatrix4(inverse.clone().multiply(mesh.matrixWorld)));
  for(const name of Object.keys(first.geometry.attributes)){
   const ref=first.geometry.attributes[name],array=new ref.array.constructor(copies.reduce((n,g)=>n+g.attributes[name].array.length,0));let offset=0;
   for(const g of copies){array.set(g.attributes[name].array,offset);offset+=g.attributes[name].array.length;}
   geometry.setAttribute(name,new ref.constructor(array,ref.itemSize,ref.normalized));
  }
  const indices=[];let offset=0;for(const g of copies){if(g.index)for(const i of g.index.array)indices.push(i+offset);else for(let i=0;i<g.attributes.position.count;i++)indices.push(i+offset);offset+=g.attributes.position.count;g.dispose();}
  geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const batch=new first.constructor(geometry,first.material);batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;
  meshes.forEach(mesh=>mesh.removeFromParent());group.add(batch);batches.push(batch);removed+=meshes.length;
 }
 // Static structures never move. Keep visibility/material updates available, skip matrix recomputation.
 group.updateMatrixWorld(true);group.traverse(node=>{node.matrixAutoUpdate=false;node.matrixWorldAutoUpdate=false;});
 return{removed,batches:batches.length,dispose(){for(const m of batches){m.removeFromParent();m.geometry.dispose();}}};
}
