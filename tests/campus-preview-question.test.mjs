import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './helpers/question-ai.mjs';
const cohort='10000000-0000-4000-8000-000000000001',lesson='10000000-0000-4000-8000-000000000002',site='https://edu.test';
test('only the products reviewer can ask about the exact listed lesson; the preview never opens student storage',async t=>{
  t.mock.method(globalThis,'fetch',async(_,options)=>{
    const body=JSON.parse(options.body);assert.equal(body.store,false);assert.match(body.input,/메모/);
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'메모를 시작하세요.'}]}]});
  });
  const orig={flag:process.env.EDU_CURRICULUM_AI_ENABLED,key:process.env.OPENAI_API_KEY};
  process.env.EDU_CURRICULUM_AI_ENABLED='true';process.env.OPENAI_API_KEY='test-fixture';
  let allowed=false;
  const api=loadTs('app/api/admin/campus/study/question/route.ts',{
    '@/lib/operator-permissions':{getOperatorUser:async scope=>{assert.equal(scope,'products');return allowed?{id:'operator'}:null;}},
    '@/lib/supabase/admin':{createAdminClient:()=>Object.freeze({})},
    '@/features/campus/study-review':{reviewSelection:async()=>({selectedCohort:{id:cohort},selected:{id:lesson,title:'실습'}}),readReviewLesson:async()=>({material:{body:'학습 메모를 쓰세요.'}})},
    '@/lib/curriculum-ai-server':{readAiBody:r=>r.json()},'@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&v.length===36},
  });
  const ask=(change={},origin=site)=>api.POST(new Request(site+'/api/admin/campus/study/question',{method:'POST',headers:{origin},body:JSON.stringify({cohort,lesson,question:'메모는 어떻게 쓰나요?',...change})}));
  try {
    assert.equal((await ask()).status,403);allowed=true;
    assert.equal((await ask({},'https://other.test')).status,403);
    assert.equal((await ask({lesson:cohort})).status,404);assert.equal((await ask({cohort:lesson})).status,404);
    assert.equal((await ask({question:'password: secret123!'})).status,400);
    assert.equal(fetch.mock.callCount(),0);assert.deepEqual(await (await ask()).json(),{answer:'메모를 시작하세요.'});assert.equal(fetch.mock.callCount(),1);
  }finally{for(const [k,v] of [['EDU_CURRICULUM_AI_ENABLED',orig.flag],['OPENAI_API_KEY',orig.key]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
