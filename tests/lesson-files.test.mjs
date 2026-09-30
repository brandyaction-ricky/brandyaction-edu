import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const lib={};new Function('exports',ts.transpileModule(fs.readFileSync(new URL('../lib/lesson-files.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(lib);
test('attachment specs reject paths, controls, executable formats, mismatched categories and noninteger/oversize lengths',()=>{
 for(const [name,size,kind] of [['../a.png',5,'image'],['a\n.png',5,'image'],['a.svg',5,'image'],['a.html',5,'file'],['a.zip',5,'image'],['a.png',0,'image'],['a.png',1.1,'image'],['a.png',10485761,'image']])assert.throws(()=>lib.answerFileSpec(name,size,kind));
 assert.equal(lib.answerFileSpec('증빙.PNG',20,'image').contentType,'image/png');
});
test('binary signatures are checked against extension and exact declared size, without executing or unpacking files',()=>{
 const cases={png:[137,80,78,71,13,10,26,10],jpg:[255,216,255],gif:[71,73,70,56,57,97],zip:[80,75,3,4],rar:[82,97,114,33,26,7,0],'7z':[55,122,188,175,39,28],gz:[31,139,8],webp:[82,73,70,70,0,0,0,0,87,69,66,80]};
 for(const [extension,bytes] of Object.entries(cases)){
  const kind=lib.answerFileTypes[extension].kind,spec=lib.answerFileSpec('test.'+extension,bytes.length,kind);
  assert.equal(lib.matchesAnswerFile(Uint8Array.from(bytes),spec),true);assert.equal(lib.matchesAnswerFile(Uint8Array.from(bytes),{...spec,size:bytes.length+1}),false);assert.equal(lib.matchesAnswerFile(new TextEncoder().encode('<script>'),spec),false);
 }
 const tar=new Uint8Array(512);tar.set(new TextEncoder().encode('ustar'),257);assert.equal(lib.matchesAnswerFile(tar,lib.answerFileSpec('file.tar',512,'file')),true);
});
