import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function files(directory) {
  return fs.readdirSync(path.join(root, directory), {withFileTypes:true}).flatMap(entry => {
    const file = directory + '/' + entry.name;
    return entry.isDirectory() ? files(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
}
function imports(file) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  return source.statements.filter(node => (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
    .map(node => ({name:node.moduleSpecifier.text, typeOnly:node.isTypeOnly || node.importClause?.isTypeOnly}));
}

test('Mission does not import Learning/Commerce internals or its compatibility shims', () => {
  for (const file of files('features/mission')) for (const {name} of imports(file)) {
    assert.doesNotMatch(name, /features\/(?:learning|commerce)|app\/ui\/(?:learning-workflows|final\/(?:classroom|member-views|learning-editor))|lib\/mission-(?:workspace|quiz)/, file);
  }
  for (const file of files('app')) for (const {name} of imports(file)) {
    if (name.startsWith('@/features/mission')) assert.match(name, /^@\/features\/mission(?:\/(?:ui|server|index))?$/, file);
  }
});

test('client-safe public Mission API cannot transitively reach server handlers, UI or admin DB', () => {
  const visited = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    assert.doesNotMatch(file, /features\/mission\/(?:server|api\/(?!contracts)|ui\/)|lib\/(?:server-auth|supabase|operator-permissions)/);
    for (const {name,typeOnly} of imports(file)) {
      if (typeOnly || !name.startsWith('.') && !name.startsWith('@/')) continue;
      const base = name.startsWith('@/') ? name.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(file), name));
      const target = [base+'.ts',base+'.tsx',base+'/index.ts'].find(value => fs.existsSync(path.join(root,value)));
      assert.ok(target, name); visit(target);
    }
  }
  visit('features/mission/index.ts');
});

test('legacy Mission entry points delegate instead of duplicating implementations', () => {
  for (const file of ['app/ui/final/mission-editor.tsx','app/ui/final/mission-questions.tsx','app/ui/final/submission-review.tsx','lib/mission-workspace.ts','lib/mission-quiz.ts']) {
    assert.match(read(file), /from ['"]@\/features\/mission/);
    assert.doesNotMatch(read(file), /(?:async )?function\s|=>/);
  }
  assert.match(read('app/api/platform/route.ts'), /return await submitMission\(db, user.id, body\)/);
  assert.match(read('app/api/platform/workflows/route.ts'), /return await readMissionQuiz\(db, user, params\)/);
  for (const route of ['questions','reviews']) assert.match(read(`app/api/mission/${route}/route.ts`), /from ['"]@\/features\/mission\/server/);
});
