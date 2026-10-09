import type { PublicLessonBlock } from './lesson-blocks';

// Keep assets as top-level blocks: permissions, revisions and saved answers keep
// their existing identities. A row changes presentation only.
export function lessonImageRows<T extends PublicLessonBlock>(blocks: T[]): T[][] {
  const rows: T[][] = [];
  for (const block of blocks) {
    const row = rows.at(-1), previous = row?.at(-1);
    if (block.type === 'image' && block.imageGroup && previous?.type === 'image' && previous.imageGroup === block.imageGroup && row!.length < 3) row!.push(block);
    else rows.push([block]);
  }
  return rows;
}

export function lessonImageColumns(blocks: PublicLessonBlock[]) {
  const columns = new Map<string, { count: number; start: number }>();
  for (const row of lessonImageRows(blocks)) if (row.length > 1) row.forEach((block, index) => columns.set(block.id, { count: row.length, start: 1 + index * (6 / row.length) }));
  return columns;
}

export function nextImageRowSize(blocks: PublicLessonBlock[], id: string) {
  const rows = lessonImageRows(blocks), index = rows.findIndex(row => row.some(block => block.id === id));
  if (index < 0 || rows[index][0].type !== 'image' || rows[index + 1]?.[0].type !== 'image') return 0;
  return rows[index].length + rows[index + 1].length;
}

export function joinNextImageRow<T extends PublicLessonBlock>(blocks: T[], id: string, groupId: string): T[] {
  const size = nextImageRowSize(blocks, id);
  if (!size) throw new Error('바로 다음에 이미지를 넣은 뒤 묶어 주세요.');
  if (size > 3) throw new Error('이미지는 한 줄에 최대 3장까지 묶을 수 있습니다.');
  const rows = lessonImageRows(blocks), index = rows.findIndex(row => row.some(block => block.id === id));
  const ids = new Set([...rows[index], ...rows[index + 1]].map(block => block.id));
  return blocks.map(block => ids.has(block.id) ? { ...block, imageGroup: groupId } : block);
}

export function splitImageRow<T extends PublicLessonBlock>(blocks: T[], id: string): T[] {
  const row = lessonImageRows(blocks).find(row => row.some(block => block.id === id));
  const ids = new Set(row?.map(block => block.id));
  return blocks.map(block => {
    if (!ids.has(block.id)) return block;
    const copy = { ...block }; delete copy.imageGroup; return copy;
  });
}
