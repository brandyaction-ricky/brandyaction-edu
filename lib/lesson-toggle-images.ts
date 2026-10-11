import { parseLessonDocument, serializeLessonDocument, type LessonNode } from './lesson-body';
import type { LessonBlock } from './lesson-blocks';

// Only references are stored in rich text. Private assets remain normal image
// blocks so the existing authorization, snapshots and media lifecycle apply.
export function lessonImageReferences(node: LessonNode): string[] {
  return node.type === 'lessonImage' ? [String(node.attrs?.blockId || '')] : (node.content || []).flatMap(lessonImageReferences);
}
export function lessonEmbeddedImageIds(blocks: Pick<LessonBlock, 'id' | 'type' | 'content'>[]): Set<string> {
  const images = new Set(blocks.filter(block => block.type === 'image').map(block => block.id));
  return new Set(blocks.filter(block => block.type === 'text').flatMap(block => {
    const doc = parseLessonDocument(block.content || '');
    return doc ? lessonImageReferences(doc).filter(id => images.has(id)) : [];
  }));
}
export function lessonToggleChoices(blocks: LessonBlock[]): { blockId: string; path: number[]; label: string }[] {
  const choices: { blockId: string; path: number[]; label: string }[] = [];
  function visit(node: LessonNode, blockId: string, path: number[]) {
    if (node.type === 'details') {
      const label = (node.content?.[0]?.content || []).map(child => child.text || '').join('') || '제목 없는 토글';
      choices.push({ blockId, path: [...path, 1], label });
    }
    node.content?.forEach((child, index) => visit(child, blockId, [...path, index]));
  }
  blocks.filter(block => block.type === 'text').forEach(block => { const doc = parseLessonDocument(block.content || ''); if (doc) visit(doc, block.id, []); });
  return choices;
}
export function lessonImageOwner(blocks: LessonBlock[], imageId: string): LessonBlock | undefined {
  return blocks.find(block => { const doc = block.type === 'text' && parseLessonDocument(block.content || ''); return doc && lessonImageReferences(doc).includes(imageId); });
}
export function remapLessonImages(content: string, ids: ReadonlyMap<string, string>): string {
  const doc = parseLessonDocument(content);
  if (!doc || !lessonImageReferences(doc).length) return content;
  function visit(node: LessonNode): LessonNode {
    if (node.type === 'lessonImage') {
      const blockId = ids.get(String(node.attrs?.blockId));
      if (!blockId) throw new Error('토글 안의 이미지도 함께 선택해 주세요.');
      return { type: node.type, attrs: { blockId } };
    }
    return { ...node, ...(node.content ? { content: node.content.map(visit) } : {}) };
  }
  return serializeLessonDocument(visit(doc));
}
export function removeLessonImageReference(blocks: LessonBlock[], imageId: string): LessonBlock[] {
  function visit(node: LessonNode): LessonNode {
    if (!node.content) return node;
    const content = node.content.filter(child => child.type !== 'lessonImage' || child.attrs?.blockId !== imageId).map(visit);
    return { ...node, content: node.type === 'detailsContent' && !content.length ? [{ type: 'paragraph' }] : content };
  }
  return blocks.map(block => {
    const doc = block.type === 'text' && parseLessonDocument(block.content || '');
    return doc && lessonImageReferences(doc).includes(imageId) ? { ...block, content: serializeLessonDocument(visit(doc)) } : block;
  });
}
