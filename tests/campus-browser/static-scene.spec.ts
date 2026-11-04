import {test,expect} from '@playwright/test';
import fs from 'node:fs';
test('static batching preserves actual curved geometry, material and normals',async({page},info)=>{
 test.skip(info.project.name!=='desktop','Geometry is identical on both devices.');test.setTimeout(120000);
 const source=fs.readFileSync('public/campus/world/tour/tour.mjs','utf8');
 const measure=`function sceneSignature(group){group.updateMatrixWorld(true);let vertices=0,triangles=0,sum=0,sum2=0,meshes=0;const inverse=group.matrixWorld.clone().invert();group.traverse(m=>{if(!m.isMesh||!m.visible)return;meshes++;const g=m.geometry.clone().applyMatrix4(inverse.clone().multiply(m.matrixWorld)),p=g.attributes.position;vertices+=p.count;triangles+=(g.index?.count||p.count)/3;for(const a of Object.values(g.attributes))for(const v of a.array){sum+=v;sum2+=v*v;}g.dispose();});return{vertices,triangles,sum,sum2,meshes};}`;
 const body=source.replace("sceneBatch=batchAtriumBoxes(groups.get('live'),CampusInstancedMesh);",`${measure}window.__geometryBefore=sceneSignature(groups.get('live'));sceneBatch=batchAtriumBoxes(groups.get('live'));window.__geometryAfter=sceneSignature(groups.get('live'));`);
 await page.route('**/campus/world/tour/tour.mjs',r=>r.fulfill({contentType:'text/javascript',body}));await page.goto('/webinar');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:90000});
 const root=page.frameLocator('iframe').locator('#office');await expect(root).toHaveAttribute('data-room','live');
 const result=await root.evaluate(()=>{const w=window as unknown as {__geometryBefore:Record<string,number>,__geometryAfter:Record<string,number>};return{before:w.__geometryBefore,after:w.__geometryAfter};});
 expect(result.after.vertices).toBe(result.before.vertices);expect(result.after.triangles).toBe(result.before.triangles);expect(result.after.sum).toBeCloseTo(result.before.sum,1);expect(result.after.sum2).toBeCloseTo(result.before.sum2,0);expect(result.after.meshes).toBeLessThan(result.before.meshes/2);await info.attach('geometry-retention',{body:JSON.stringify(result),contentType:'application/json'});
 await page.screenshot({path:test.info().outputPath('campus-natural-desktop.png')});
});
