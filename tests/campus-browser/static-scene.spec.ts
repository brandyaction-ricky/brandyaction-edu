import {test,expect} from '@playwright/test';
test('static batching preserves actual curved geometry, material and normals',async({page},info)=>{
 test.skip(info.project.name!=='desktop','Geometry is identical on both devices.');test.setTimeout(120000);
 const measure=`function sceneSignature(group){group.updateMatrixWorld(true);let vertices=0,triangles=0,sum=0,sum2=0,meshes=0;const inverse=group.matrixWorld.clone().invert();group.traverse(m=>{if(!m.isMesh||!m.visible)return;meshes++;const g=m.geometry.clone().applyMatrix4(inverse.clone().multiply(m.matrixWorld)),p=g.attributes.position;vertices+=p.count;triangles+=(g.index?.count||p.count)/3;for(const a of Object.values(g.attributes))for(const v of a.array){sum+=v;sum2+=v*v;}g.dispose();});return{vertices,triangles,sum,sum2,meshes};}`;
 const body=`import {batchAtriumBoxes as original} from './static-batches.mjs?original';
 ${measure}
 export function batchAtriumBoxes(group,...args) {
  const before=sceneSignature(group);
  const batch=original(group,...args);
  (window.__sceneBatches ||= []).push({group,before,after:sceneSignature(group)});
  return batch;
 }`;
 await page.route('**/tour/static-batches.mjs',r=>r.fulfill({contentType:'text/javascript',body}));
 await page.goto('/webinar');
 await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:90000});
 const root=page.frameLocator('iframe').locator('#office');
 await expect(root).toHaveAttribute('data-room','live');
 const result=await root.evaluate(()=>{
  type Batch={group:{visible:boolean},before:Record<string,number>,after:Record<string,number>};
  const batches=(window as unknown as {__sceneBatches:Batch[]}).__sceneBatches;
  const visible=batches.filter(b=>b.group.visible);
  if(visible.length!==1)throw Error('Expected one visible batched room in the live hall');
  return {before:visible[0].before,after:visible[0].after};
 });
 expect(result.after.vertices).toBe(result.before.vertices);expect(result.after.triangles).toBe(result.before.triangles);expect(result.after.sum).toBeCloseTo(result.before.sum,1);expect(result.after.sum2).toBeCloseTo(result.before.sum2,0);expect(result.after.meshes).toBeLessThan(result.before.meshes/2);await info.attach('geometry-retention',{body:JSON.stringify(result),contentType:'application/json'});
 await page.screenshot({path:test.info().outputPath('campus-natural-desktop.png')});
});
