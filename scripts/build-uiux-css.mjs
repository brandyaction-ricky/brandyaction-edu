// Keep the supplied final publishing source as the visual source of truth.
// This is a build-time copy/scope step; prototype JavaScript is never shipped.
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const root = process.cwd();
const source = path.join(root, 'design-reference/source');
const target = path.join(root, 'app/ui/final');
fs.mkdirSync(target, { recursive: true });
const read = (file) => fs.readFileSync(path.join(source, file), 'utf8');
fs.writeFileSync(path.join(target, 'tokens.css'), read('shared/tokens.css'));
for (const area of ['frontend', 'admin']) {
  const scope = area === 'frontend' ? '.edu-front' : '.edu-admin';
  const css = [read(`${area}/src/interface.css`), read('shared/tokens.css'), read('shared/components.css'), read(`${area}/src/experience.css`)].join('\n');
  const ast = postcss.parse(css);
  ast.walkRules((rule) => {
    if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    rule.selectors = rule.selectors.map((selector) => {
      if (selector === ':root' || selector === 'body' || selector === 'html') return scope;
      if (/^(?:body|html)(?=[.\s:#[])/.test(selector)) return selector.replace(/^(body|html)/, scope);
      return `${scope} ${selector}`;
    });
  });
  fs.writeFileSync(path.join(target, `${area}.css`), `/* Generated from final UIUX source; run node scripts/build-uiux-css.mjs. */\n${ast.toString()}\n`);
}
console.log('Final frontend/admin CSS generated with isolated scopes.');
