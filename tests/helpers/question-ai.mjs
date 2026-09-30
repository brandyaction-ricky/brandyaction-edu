import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),root=new URL('../../',import.meta.url);
export function loadTs(file,overrides={}){
 const cache=new Map();
 function load(name){if(cache.has(name))return cache.get(name);const out={};cache.set(name,out);const source=fs.readFileSync(new URL(name,root),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  new Function('exports','require',js)(out,id=>id in overrides?overrides[id]:id.startsWith('.')?load(path.posix.normalize(path.posix.join(path.posix.dirname(name),id))+'.ts'):id.startsWith('@/')?load(id.slice(2)+'.ts'):require(id));return out;
 }return load(file);
}
