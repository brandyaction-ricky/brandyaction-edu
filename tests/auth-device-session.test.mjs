import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const read = p => fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
function routeHarness(auth){
 const code=ts.transpileModule(read('app/auth/signout/route.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('exports','require',code)(exports,n=>n==='@/lib/supabase/server'?{createClient:async()=>({auth})}:{NextResponse:{redirect:(url,options)=>({url:String(url),status:options.status})}});
 return exports;
}
test('server signout only terminates this session and preserves the other device',async()=>{
 const active=new Set(['pc','app']);let scope;
 const auth={signOut:async options=>{scope=options?.scope;if(scope==='local')active.delete('pc');else active.clear();return{error:null};}};
 const r=await routeHarness(auth).POST(new Request('https://edu.test/auth/signout',{method:'POST'}));
 assert.equal(r.status,303);assert.equal(r.url,'https://edu.test/');assert.equal(scope,'local');assert.deepEqual([...active],['app']);
});
test('every ordinary logout entry explicitly uses local scope',()=>{
 for(const path of ['app/ui/platform.tsx','app/auth/consent/page.tsx','app/auth/signout/route.ts']){
  const source=ts.createSourceFile(path,read(path),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let calls=0;
  function walk(node){if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='signOut'){
   calls++;const argument=node.arguments[0];assert.ok(argument&&ts.isObjectLiteralExpression(argument),path);
   assert.ok(argument.properties.some(p=>ts.isPropertyAssignment(p)&&p.name.getText(source)==='scope'&&ts.isStringLiteral(p.initializer)&&p.initializer.text==='local'),path);
  }ts.forEachChild(node,walk);}
  walk(source);assert.equal(calls,1,path);
 }
});
