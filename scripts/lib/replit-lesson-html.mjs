import { parseFragment } from 'parse5';

// HTML is parsed as data and converted to the editor's small node vocabulary.
// Unsupported content blocks conversion; nothing is executed or silently lost.
export function convertLearningHtml(html, contract) {
  const problems = new Set();
  const fragment = parseFragment(html);
  const inlineMarks = { strong: 'bold', b: 'bold', em: 'italic', i: 'italic', u: 'underline', s: 'strike', del: 'strike' };
  function children(node, marks = []) { return (node.childNodes || []).flatMap(child => visit(child, marks)); }
  function blockChildren(nodes) {
    const result = []; let run = [];
    const flush = () => { if (run.length) result.push({ type: 'paragraph', content: run }); run = []; };
    for (const node of nodes) {
      if (['text', 'hardBreak'].includes(node.type)) run.push(node);
      else { flush(); result.push(node); }
    }
    flush(); return result;
  }
  let count = 0;
  function visit(node, marks = [], depth = 0) {
    if (++count > 20000 || depth > 40) throw new Error('HTML_LIMIT');
    if (node.nodeName === '#comment') return [];
    if (node.nodeName === '#text') return node.value ? [{ type: 'text', text: node.value, ...(marks.length ? { marks } : {}) }] : [];
    const tag = node.tagName;
    const attrs = Object.fromEntries((node.attrs || []).map(a => [a.name, a.value]));
    const allowed = tag === 'a' ? ['href', 'target', 'rel'] : tag === 'ol' ? ['start'] : tag === 'span' ? ['style'] : [];
    if (Object.keys(attrs).some(name => !allowed.includes(name))) problems.add('HTML_ATTRIBUTES_REVIEW');
    const nested = nextMarks => (node.childNodes || []).flatMap(child => visit(child, nextMarks, depth + 1));
    if (inlineMarks[tag]) return nested([...marks, { type: inlineMarks[tag] }]);
    if (tag === 'a') {
      let url; try { url = new URL(attrs.href); } catch { /* Mark the whole document unready below. */ }
      if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) { problems.add('HTML_LINK_REVIEW'); return nested(marks); }
      return nested([...marks, { type: 'link', attrs: { href: attrs.href } }]);
    }
    if (tag === 'span') {
      if (!attrs.style) return nested(marks);
      const match = /^\s*font-size\s*:\s*(\d+)px\s*;?\s*$/i.exec(attrs.style);
      if (!match || !contract.LESSON_FONT_SIZES.includes(Number(match[1]))) { problems.add('HTML_STYLE_REVIEW'); return nested(marks); }
      return nested([...marks, { type: 'textStyle', attrs: { fontSize: `${Number(match[1])}px` } }]);
    }
    if (tag === 'br') return [{ type: 'hardBreak' }];
    if (tag === 'div') return blockChildren(nested(marks));
    if (tag === 'p' || tag === 'h2' || tag === 'h3') return [{ type: tag === 'p' ? 'paragraph' : 'heading', ...(tag !== 'p' ? { attrs: { level: Number(tag[1]) } } : {}), content: nested(marks) }];
    if (tag === 'ul' || tag === 'ol') {
      const start = attrs.start === undefined ? 1 : Number(attrs.start);
      if (!Number.isSafeInteger(start) || start < 1 || start > 10000) problems.add('HTML_LIST_REVIEW');
      const content = nested(marks);
      if (content.some(n => n.type !== 'listItem' && (n.type !== 'text' || n.text.trim()))) problems.add('HTML_LIST_REVIEW');
      return [{ type: tag === 'ul' ? 'bulletList' : 'orderedList', ...(tag === 'ol' ? { attrs: { start } } : {}), content: content.filter(n => n.type === 'listItem') }];
    }
    if (tag === 'li' || tag === 'blockquote') return [{ type: tag === 'li' ? 'listItem' : 'blockquote', content: blockChildren(nested(marks)) }];
    problems.add('HTML_ELEMENT_REVIEW'); return []; // The untouched source stays in the private export, never in the DOM.
  }
  let document;
  try { document = { type: 'doc', content: blockChildren(children(fragment)) }; }
  catch { return { content: null, issues: ['HTML_LIMIT'] }; }
  if (problems.size) return { content: null, issues: [...problems] };
  const normalized = contract.normalizeLessonDocument(document);
  if (!normalized || JSON.stringify(normalized) !== JSON.stringify(document)) return { content: null, issues: ['HTML_NORMALIZATION_REVIEW'] };
  // Preserve empty paragraphs too; serializeLessonDocument intentionally drops
  // an all-empty editor document and is therefore unsuitable for this adapter.
  return { content: contract.LESSON_BODY_PREFIX + JSON.stringify(document), issues: [] };
}
