import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
function load(name){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL(`../lib/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,request=>load(request.replace('./','')));return exports;}
const calc=load('lesson-calculators'),contract=load('lesson-blocks');
// Expected results were evaluated independently from the original Replit code.
const golden=JSON.parse(fs.readFileSync(new URL('./fixtures/lesson-calculators-golden.json',import.meta.url),'utf8'));
for(const [i,fixture]of golden.recipe.entries())test(`recipe original case ${i}: daily averages, details, rounding and achievement benchmarks`,()=>assert.deepEqual(calc.calculateRecipe(fixture.values),fixture.expected));
for(const [i,fixture]of golden.margin.entries())test(`margin original case ${i}: fees, tax type, costs, zero price and decimals`,()=>assert.deepEqual(calc.calculateMargin(fixture.values),fixture.expected));
for(const [i,fixture]of golden.funnel.slice(0,3).entries())test(`funnel original case ${i}: stages, conversion rates and bounded bands`,()=>assert.deepEqual(calc.calculateFunnel(fixture.values),fixture.expected));
test('zero-base funnel explicitly has no overall conversion, rather than inventing denominator 1',()=>{
  const f=golden.funnel[3],actual=calc.calculateFunnel(f.values);
  assert.equal(f.expected[1].overall,2000);
  assert.deepEqual(actual.map(r=>r.overall),[null,null]);
  assert.equal(actual[1].previous,null);
  assert.deepEqual(actual.map(r=>r.ratio),f.expected.map(r=>r.ratio));
});
for(const type of ['recipe-calculator','margin-calculator','marketing-funnel'])test(`${type} definition and drafts are validated on server without overwriting other block answers`,()=>{
  const b=calc.newCalculatorBlock(type,'tool'),doc={schemaVersion:1,blocks:[b,{id:'question',type:'question',question:{label:'기존 답변',kind:'text',required:true}}],checklist:[]};
  assert.deepEqual(contract.validateLessonBlocks(doc),doc);
  const values=type==='recipe-calculator'?{placeVisits:'450'}:type==='margin-calculator'?{salePrice:'10000'}:{data:JSON.stringify(calc.DEFAULT_FUNNEL_STAGES)};
  const answer={blocks:{tool:values,question:'유지'},checklist:[]};
  assert.deepEqual(contract.validateBlockAnswers(answer,doc),answer);
  assert.deepEqual(contract.validateBlockAnswers({blocks:{tool:{}},checklist:[]},doc),{blocks:{tool:{}},checklist:[]});
  for(const mutate of [b=>delete b.toolVersion,b=>b.fields[0].id='wrong',b=>b.fields[0].label='다름',b=>b.toolVersion='unknown']){
    const changed=structuredClone(doc);mutate(changed.blocks[0]);assert.equal(calc.hasCalculatorDefinition(changed.blocks[0]),false);assert.throws(()=>contract.validateLessonBlocks(changed));
  }
  assert.throws(()=>contract.validateBlockAnswers({blocks:{tool:{arbitrary:'value'}},checklist:[]},doc));
});
test('rejects negative, non-finite, trailing garbage and excessively large calculator values',()=>{
  for(const value of ['-1','Infinity','NaN','12 garbage','1e309','1000000000000001']){
    assert.equal(calc.validCalculatorNumber(value),false);assert.throws(()=>calc.calculateRecipe({placeVisits:value}));assert.throws(()=>calc.calculateMargin({salePrice:value}));
  }
  for(const value of ['', '0', '1.25', '.5', '1e3'])assert.equal(calc.validCalculatorNumber(value),true);
  const doc={schemaVersion:1,blocks:[calc.newCalculatorBlock('margin-calculator','tool')],checklist:[]};
  for(const values of [{channel:'unknown'},{vatType:'unknown'},{categoryFee:'-1'},{salePrice:3}])assert.throws(()=>contract.validateBlockAnswers({blocks:{tool:values},checklist:[]},doc),e=>e.status===400);
});
test('structured funnel drafts reject corrupt or unbounded stages rather than reverting to sample data',()=>{
  const stages=calc.DEFAULT_FUNNEL_STAGES;
  assert.deepEqual(calc.parseFunnelStages(),stages);
  for(const mutate of [s=>s.splice(0,5),s=>s.push({...s[0]}),s=>s[0].id='__proto__',s=>s[0].name='x'.repeat(101),s=>s[0].value='-1',s=>s[0].unexpected='x',s=>s[0].value=4]){
    const changed=structuredClone(stages);mutate(changed);assert.throws(()=>calc.parseFunnelStages(JSON.stringify(changed)));
  }
  assert.throws(()=>calc.parseFunnelStages('not-json'));
  assert.throws(()=>calc.parseFunnelStages(JSON.stringify(Array.from({length:51},(_,i)=>({id:'s'+i,name:'단계',value:'1'})))));
  const doc={schemaVersion:1,blocks:[calc.newCalculatorBlock('marketing-funnel','tool')],checklist:[]};
  assert.throws(()=>contract.validateBlockAnswers({blocks:{tool:{data:'not-json'}},checklist:[]},doc),e=>e.status===400);
});
