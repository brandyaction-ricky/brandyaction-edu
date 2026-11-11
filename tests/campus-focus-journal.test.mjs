import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
// Finishing a study-room focus block offers an action-journal entry, only where the journal (focus module) is on.
test('finishing a focus block opens the journal form only when the journal is available',()=>{
 const panel=read('features/campus/space/panel.tsx'),preview=read('features/campus/tour/preview.tsx');
 assert.match(panel,/if\(journal&&spent!==null\)\{setJournaling\(spent\);/);
 assert.match(panel,/else setNotice\('오늘 한 일과 다음 시작점을 내 메모에 남겨 보세요\.'\)/);
 assert.match(preview,/<SpaceTools journal=\{live\?!!live\.modules\?\.focus:true\}/);
});
test('the journal form finishes an open run or starts one, and needs a result and a next step',()=>{
 const form=read('features/campus/space/focus-journal.tsx');
 assert.ok(form.indexOf("kind:'start'")<form.indexOf("kind:'finish'"));
 assert.match(form,/r\.session&&r\.session\.status!=='finished'\?r\.session:null/);
 assert.match(form,/disabled=\{busy\|\|!result\.trim\(\)\|\|!next\.trim\(\)\|\|\(!open&&\(!action\.trim\(\)\|\|!lesson\)\)\}/);
});
