import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const exports={};
new Function('exports',ts.transpileModule(fs.readFileSync(new URL('../lib/product-copy-review.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports);
test('copy reminders find claims and event dates without treating styles or scripts as sales claims',()=>{
 const check=exports.productCopyReminders;
 assert.deepEqual(check('AI로 내 업무를 바꾸는 실행 수업'),[]);
 assert.equal(check('<h1>매출 보장! 99% 자동화, 국내 최초</h1><p>11월 5일</p>').length,4);
 assert.deepEqual(check('<style>.x{width:100%}</style><script>const example="매출 보장"</script><p>실행 수업</p>'),[]);
 assert.equal(check('3배, 10명 중 9명').length,1);
 assert.equal(check('누구나 성공').length,1);
});
