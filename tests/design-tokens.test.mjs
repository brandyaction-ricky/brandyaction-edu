import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const tokenSource = fs.readFileSync('design-reference/source/shared/tokens.css', 'utf8');
const tokenOutput = fs.readFileSync('app/ui/final/tokens.css', 'utf8');
const styleFiles = [
  'design-reference/source/shared/components.css',
  'design-reference/source/admin/src/experience.css',
  'design-reference/source/admin/src/interface.css',
  'design-reference/source/frontend/src/experience.css',
  'design-reference/source/frontend/src/interface.css',
  'app/ui/final/integration.css',
  'features/admin-ui/styles/admin-system.css',
];

test('shared spacing, motion and text tokens used by published UI are defined', () => {
  const references = new Set(
    styleFiles.flatMap((file) =>
      [...fs.readFileSync(file, 'utf8').matchAll(/var\(\s*(--(?:space|motion|text)-[\w-]+)/g)]
        .map((match) => match[1]),
    ),
  );
  const definitions = new Set(
    [...tokenSource.matchAll(/(--(?:space|motion|text)-[\w-]+)\s*:/g)]
      .map((match) => match[1]),
  );
  assert.deepEqual([...references].filter((name) => !definitions.has(name)).sort(), []);
});

test('published shared tokens match the editable source', () => {
  assert.equal(tokenOutput, tokenSource);
});
