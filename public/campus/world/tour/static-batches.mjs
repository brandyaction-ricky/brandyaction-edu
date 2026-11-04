/** Batch only untextured, static standard-material boxes; shapes and placement stay exact. */
export function batchAtriumBoxes(group,InstancedMesh){
 group.updateMatrixWorld(true);const buckets=new Map(),batches=[];
 group.traverse(mesh=>{
  const m=mesh.material,p=mesh.geometry?.parameters;
  if(!mesh.isMesh||mesh.isInstancedMesh||mesh.geometry?.type!=='BoxGeometry'||!p||p.width<=0||p.height<=0||p.depth<=0||!m||Array.isArray(m)||m.type!=='MeshStandardMaterial'||m.transparent||m.map||m.normalMap||m.roughnessMap||m.metalnessMap||m.alphaMap||m.aoMap||m.lightMap||m.envMap||m.vertexColors||m.alphaTest||!mesh.visible)return;
  const key=[m.color.getHex(),m.roughness,m.metalness,m.emissive.getHex(),m.emissiveIntensity,m.side,m.depthWrite,m.depthTest,mesh.castShadow,mesh.receiveShadow].join(':');
  if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(mesh);
 });
 const inverse=group.matrixWorld.clone().invert();let removed=0;
 for(const meshes of buckets.values()){
  if(meshes.length<3)continue;const first=meshes[0],p=first.geometry.parameters,geometry=first.geometry.clone();geometry.scale(1/p.width,1/p.height,1/p.depth);
  const batch=new InstancedMesh(geometry,first.material.clone(),meshes.length);batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;batch.frustumCulled=false;
  meshes.forEach((mesh,i)=>{const size=mesh.geometry.parameters,matrix=inverse.clone().multiply(mesh.matrixWorld);matrix.scale(mesh.position.clone().set(size.width,size.height,size.depth));batch.setMatrixAt(i,matrix);mesh.removeFromParent();mesh.geometry.dispose();});
  batch.instanceMatrix.needsUpdate=true;group.add(batch);batches.push(batch);removed+=meshes.length;
 }
 return{removed,batches:batches.length,dispose(){for(const m of batches){m.removeFromParent();m.dispose();m.geometry.dispose();m.material.dispose();}}};
}
