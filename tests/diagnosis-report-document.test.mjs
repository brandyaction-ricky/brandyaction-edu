import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
const require=createRequire(import.meta.url), exports={};
const source=ts.transpileModule(readFileSync(new URL('../app/ui/final/diagnosis-report-document.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
new Function('exports','require',source)(exports,require);
const {parseDiagnosisReport,reportText,reportTableCells,DiagnosisReportDocument}=exports;
const markdown='---\ntitle: "합성 검사"\nreport_id: "private-report-id"\nresponse_id: "private-response-id"\nexport_version: "private-version"\n---\n\n# 나의 검사 결과\n\n## 검사 점수\n\n| 욕구 | 점수 |\n| --- | --- |\n| 성장\\|선택 | 80 |\n| 연결 | 첫 줄<br>둘째 줄 |\n\n### 내 경험\n\n편한 &amp; 솔직한 문장\\.\n\n- 첫 항목\n  이어지는 문장\n- 둘째 항목\n\n> 나의 선택\n> 다음 문장\n\n---\n\n## 다음 이야기\n\n**질문 주제:** 합성 질문\n';
test('canonical MD previews hide YAML provenance and render a readable document structure',()=>{
  const blocks=parseDiagnosisReport(markdown);assert.equal(blocks[0].text,'나의 검사 결과');assert.doesNotMatch(JSON.stringify(blocks),/private-report-id|private-response-id|private-version|export_version/);
  const table=blocks.find(b=>b.type==='table');assert.deepEqual(table.columns,['욕구','점수']);assert.deepEqual(table.rows,[['성장|선택','80'],['연결','첫 줄\n둘째 줄']]);
  assert.deepEqual(blocks.find(b=>b.type==='list').items,['첫 항목\n이어지는 문장','둘째 항목']);assert.equal(blocks.find(b=>b.type==='quote').text,'나의 선택\n다음 문장');
  const html=renderToStaticMarkup(createElement(DiagnosisReportDocument,{markdown}));for(const tag of ['<h2','<h3','<h4','<table','<th scope="col"','<ul','<li','<blockquote','<hr','<strong'])assert.ok(html.includes(tag),tag);assert.doesNotMatch(html,/private-report-id|private-response-id|private-version/);
});
test('MD text escapes decode once into inert text; HTML links and Obsidian embeds never activate',()=>{
  const dangerous='# 제목\n\n&lt;script&gt;alert(1)&lt;/script&gt;\n\n<img src=x onerror=alert(1)>\n\n\\[클릭\\]\\(javascript:alert\\(1\\)\\)\n\n\\!\\[\\[비밀\\]\\]\n\n&amp;lt;svg&amp;gt;\n';
  const html=renderToStaticMarkup(createElement(DiagnosisReportDocument,{markdown:dangerous}));assert.doesNotMatch(html,/<script|<img|<svg|<a\s|<iframe|<embed/);assert.match(html,/&lt;script&gt;alert/);assert.match(html,/javascript:alert/);assert.match(html,/!\[\[비밀\]\]/);
  assert.equal(reportText('&amp;lt;script&amp;gt;'),'&lt;script&gt;');assert.equal(reportText('100&#37; &quot;명료함&quot;'),'100% "명료함"');assert.equal(reportText('&#0;'),'&#0;');
});
test('only unescaped pipes split tables, and literal encoded br remains plain text',()=>{
  assert.deepEqual(reportTableCells('| 하나\\|둘 | 셋 |'),['하나\\|둘','셋']);
  assert.deepEqual(reportTableCells('| 역슬래시\\\\ | 둘 |'),['역슬래시\\\\','둘']);
  const table=parseDiagnosisReport('| 항목 |\n| --- |\n| &lt;br&gt; |')[0];assert.equal(table.rows[0][0],'<br>');
  const plain=parseDiagnosisReport('---\n\n일반 첫 문장\n\n---\n끝');assert.equal(plain[0].type,'rule');assert.ok(plain.some(b=>b.text==='일반 첫 문장'));
});
