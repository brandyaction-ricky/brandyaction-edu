import{readFileSync}from'node:fs';import{createRequire}from'node:module';import ts from'typescript';
const require=createRequire(import.meta.url),cache=new Map();
export function candidate(name){if(cache.has(name))return cache.get(name);const result={};cache.set(name,result);
 const code=ts.transpileModule(readFileSync(new URL('../../lib/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('exports','require',code)(result,n=>n==='server-only'?{}:n.startsWith('./edu-tips-')?n.endsWith('.json')?JSON.parse(readFileSync(new URL('../../lib/'+n.slice(2),import.meta.url))):candidate(n.slice(2)):require(n));return result;}
