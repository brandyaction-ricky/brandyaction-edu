import { isCalculator } from './lesson-calculators';
import { isGuidedTool } from './lesson-guided-tools';
import type { LessonBlock, LessonBlockDocument, LessonBlockType } from './lesson-blocks';

export const curriculumTextLimit = 1_000_000;
export type TextImportResult = Pick<LessonBlockDocument, 'blocks' | 'checklist'> & { warnings: string[] };
export type LessonCardSource = { id: string; label: string };
const uid = () => crypto.randomUUID();
export const importBlockLabels: Record<LessonBlockType, string> = {
  heading: '큰 제목', subheading: '작은 제목', text: '본문', video: '영상', audio: '음성', image: '이미지', question: '중간 질문', divider: '구분선', link: '외부 링크', prompt: '복사할 프롬프트',
  'prompt-generator': '프롬프트 생성기', 'persona-generator': '페르소나 생성기', 'landing-planner': '랜딩페이지 기획', 'recipe-calculator': '레시피 계산기', 'margin-calculator': '마진 계산기', 'marketing-funnel': '마케팅 퍼널', quiz: '확인 문제',
};
export function summarizeImportBlock(block: LessonBlock) {
  return (block.question?.label || block.content || (block.quiz ? `${block.quiz.questions.length}개 문항` : '') || block.url || importBlockLabels[block.type]).slice(0, 180);
}
function bareUrl(s: string) { return /^https?:\/\/\S+$/.test(s) || /^(?:www\.)?[\w-]+\.(?:com|io|kr|net|org|co\.kr|app|dev|ai)\/?$/.test(s); }

// Matches the original CurriculumImport grammar. Unlike the original parser,
// malformed structured sections are reported with a line number, never silently
// discarded (especially quiz keys), and every iteration consumes input.
export function parseCurriculumText(raw: string): TextImportResult {
  if (new TextEncoder().encode(raw).byteLength > curriculumTextLimit) throw new Error('텍스트는 1MB 이하로 나누어 가져와 주세요.');
  if (raw.includes('\0') || raw.includes('\uFFFD')) throw new Error('텍스트 인코딩을 확인해 주세요. UTF-8 파일로 저장한 뒤 다시 가져와 주세요.');
  const lines = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const result: TextImportResult = { blocks: [], checklist: [], warnings: [] };
  let i = 0;
  const at = (n = i) => (lines[n] || '').trim();
  const blanks = () => { while (i < lines.length && !at()) i++; };
  const fail = (message: string, line = i) => { throw new Error(`${line + 1}번째 줄: ${message}`); };
  const add = (type: LessonBlockType, content = '', extra: Partial<LessonBlock> = {}) => { result.blocks.push({ id: uid(), type, content, ...extra }); };
  const special = (s: string) => ['---', 'Prompt', 'Q', '쪽지시험', '맞춤형 프롬프트 생성기', '미션 체크리스트', 'favicon', 'content image'].includes(s) || /^Day\s+\d+$/i.test(s) || /^#{1,6}\s+/.test(s) || /^\[이미지\s*삽입/.test(s) || bareUrl(s);
  function readPrompt() {
    const start = i;
    i++; blanks();
    if (at() === '복사하기') { i++; blanks(); }
    if (!/^```(?:\w+)?$/.test(at())) fail('Prompt 다음에 ```로 감싼 프롬프트 본문을 넣어 주세요.', start);
    i++; const begin = i;
    while (i < lines.length && at() !== '```') i++;
    if (i === lines.length) fail('프롬프트를 닫는 ```가 없습니다.', start);
    const content = lines.slice(begin, i).join('\n').replace(/^\n+|\n+$/g, ''); i++;
    if (!content.trim()) fail('프롬프트 내용이 비어 있습니다.', start);
    return content;
  }
  function link(url: string, label = '') {
    const value = url.startsWith('http') ? url : `https://${url}`;
    try { const parsed = new URL(value); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error(); }
    catch { fail('암호가 포함되지 않은 HTTPS 링크를 사용해 주세요.'); }
    add('link', label, { url: value });
  }
  while (i < lines.length) {
    const start = i, s = at();
    if (!s) { i++; continue; }
    if (s === '---') { add('divider'); i++; }
    else if (/^Day\s+\d+$/i.test(s)) {
      i++; blanks();
      if (!at() || special(at())) fail('Day 번호 다음에 학습 제목을 넣어 주세요.', start);
      add('heading', at()); i++;
    } else if (/^#{1,6}\s+/.test(s)) { add(s.startsWith('###') ? 'subheading' : 'heading', s.replace(/^#{1,6}\s+/, '')); i++; }
    else if (s === 'Prompt') add('prompt', readPrompt());
    else if (s === '맞춤형 프롬프트 생성기') {
      i++; const fields: NonNullable<LessonBlock['fields']> = [];
      while (i < lines.length && (!at() || at() === '반영' || /^\d+$/.test(at()))) i++;
      while (i < lines.length && at() !== 'Prompt') {
        if (!at()) { i++; continue; }
        if (special(at())) fail('생성기 질문 뒤에 Prompt와 프롬프트 틀을 넣어 주세요.', start);
        const label = at(); i++; blanks(); let placeholder = '';
        if (/^예시\s*[):]/.test(at())) { placeholder = at().replace(/^예시\s*[):]\s*/, ''); i++; }
        fields.push({ id: uid(), label, variable: label, placeholder: placeholder ? `예시) ${placeholder}` : `${label} 입력`, required: false, sensitive: false });
      }
      if (!fields.length || fields.length > 100 || at() !== 'Prompt') fail('생성기 질문(1~100개)과 Prompt 틀이 필요합니다.', start);
      if (fields.some(f => f.label.length > 100 || /[{}]/.test(f.variable)) || new Set(fields.map(f => f.variable.replace(/\s+/g, ''))).size !== fields.length) fail('생성기 질문 이름은 중복 없이 100자 이내로 입력해 주세요.', start);
      const content = readPrompt();
      add('prompt-generator', content, { fields });
    } else if (s === 'Q') {
      i++; const text: string[] = []; let image = false;
      while (i < lines.length && at() && !special(at())) {
        if (['이미지를 업로드하세요', '이미지 업로드'].includes(at())) image = true;
        else text.push(lines[i]);
        i++;
      }
      // The source also puts the upload hint after a blank line.
      const end = i; blanks();
      if (['이미지를 업로드하세요', '이미지 업로드'].includes(at())) { image = true; i++; } else i = end;
      const label = text.join('\n').trim();
      if (!label || label.length > 5000) fail('질문 문구를 1~5,000자로 입력해 주세요.', start);
      add('question', '', { question: { label, kind: image ? 'image' : 'text', required: false } });
    } else if (s === '쪽지시험') {
      i++; const questions: NonNullable<LessonBlock['quiz']>['questions'] = [];
      for (;;) {
        blanks();
        if (i === lines.length || special(at())) break;
        if (!/^문항\s+\d+$/.test(at())) fail('시험은 ‘문항 N → 질문 → 선택지 4개 → 정답 : N’ 순서로 입력해 주세요.');
        i++; blanks(); const prompt = at();
        if (!prompt || special(prompt) || /^문항\s+\d+$/.test(prompt)) fail('시험 질문을 입력해 주세요.');
        i++; const options: string[] = [];
        for (let n = 1; n <= 4; n++) {
          blanks(); const option = at();
          if (!option || special(option) || /^(?:문항\s+\d+|정답\s*:)/.test(option)) fail('시험 선택지는 4개가 필요합니다.');
          options.push(option.replace(new RegExp(`^(?:${n}[.)]|\\[${n}\\]|${'①②③④'[n - 1]})\\s*`), '')); i++;
        }
        blanks(); const answer = at().match(/^정답\s*:\s*([1-4])\s*$/);
        if (!answer || options.some(v => !v.trim() || v.length > 5000) || prompt.length > 10000) fail('정답을 ‘정답 : 1~4’로 입력하고 질문·선택지 길이를 확인해 주세요.');
        questions.push({ id: uid(), prompt, options, correctIndex: Number(answer![1]) - 1 }); i++;
      }
      if (!questions.length || questions.length > 100) fail('시험 문항은 1~100개가 필요합니다.', start);
      add('quiz', '쪽지시험', { quiz: { questions, passPercent: 100 } });
    } else if (/^\[이미지\s*삽입/.test(s) || s === 'content image') {
      add('image', s === 'content image' ? '' : s, { url: '' });
      result.warnings.push(`${i + 1}번째 줄: 이미지 자리만 가져왔습니다. 편집 화면에서 이미지를 연결해야 저장할 수 있습니다.`); i++;
    } else if (s === '미션 체크리스트') {
      i++;
      while (i < lines.length && !special(at())) {
        const item = at(); i++;
        if (!item || item.startsWith('모든 필수')) continue;
        const required = item.endsWith('*'), label = required ? item.slice(0, -1).trim() : item;
        if (!label || label.length > 5000) fail('체크 문구를 1~5,000자로 입력해 주세요.', i - 1);
        result.checklist.push({ id: uid(), label, required });
      }
    } else if (s === 'favicon') {
      i++; blanks(); const label = at(); i++; blanks();
      if (!bareUrl(at())) fail('favicon 다음에 이름과 HTTPS 주소를 넣어 주세요.', start);
      link(at(), label); i++;
    } else if (bareUrl(s)) { link(s); i++; }
    else {
      // Consecutive numbered lines stay together as a list, matching source.
      const item = s.match(/^(\d+)\.\s+.+$/); let next = i + 1;
      while (next < lines.length && !at(next)) next++;
      if (item && Number(at(next).match(/^(\d+)\.\s+/)?.[1]) !== Number(item[1]) + 1) { add('heading', s); i++; }
      else {
        const text: string[] = [];
        do {
          text.push(lines[i]); i++;
          const numbered = at().match(/^(\d+)\.\s+/);
          if (numbered) {
            const previous = [...text].reverse().find(l => l.trim())?.trim().match(/^(\d+)\.\s+/);
            if (!previous || Number(previous[1]) + 1 !== Number(numbered[1])) break;
          }
        } while (i < lines.length && !special(at()));
        add('text', text.join('\n').trim());
      }
    }
    if (i <= start) throw new Error('텍스트를 해석하지 못했습니다. 해당 부분을 확인해 주세요.');
    if (result.blocks.length > 1000 || result.checklist.length > 1000 || result.blocks.some(b => (b.content?.length || 0) > 200000)) throw new Error('항목 수나 내용이 너무 많습니다. 파일을 나누어 가져와 주세요.');
  }
  return result;
}

// Block identity scopes all learner answers. Fresh block/quiz IDs make copies
// independent; built-in tool field IDs are semantic contracts, so retain them.
export function cloneLessonCards(blocks: LessonBlock[]): LessonBlock[] {
  return structuredClone(blocks).map(block => ({ ...block, id: uid(),
    ...(block.fields && !isGuidedTool(block.type) && !isCalculator(block.type) ? { fields: block.fields.map(field => ({ ...field, id: uid() })) } : {}),
    ...(block.quiz ? { quiz: { ...block.quiz, questions: block.quiz.questions.map(q => ({ ...q, id: uid() })) } } : {}),
  }));
}
export function applyLessonImport(current: LessonBlockDocument, imported: Pick<TextImportResult, 'blocks' | 'checklist'>, mode: 'append' | 'replace' | number): LessonBlockDocument {
  if (typeof mode === 'number' && (!Number.isInteger(mode) || mode < 0 || mode > current.blocks.length)) throw new Error('붙여넣을 위치를 다시 선택해 주세요.');
  const blocks = cloneLessonCards(imported.blocks), checklist = imported.checklist.map(c => ({ ...c, id: uid() }));
  const result = { ...current,
    blocks: mode === 'replace' ? blocks : typeof mode === 'number' ? [...current.blocks.slice(0, mode), ...blocks, ...current.blocks.slice(mode)] : [...current.blocks, ...blocks],
    checklist: mode === 'replace' && checklist.length ? checklist : [...current.checklist, ...checklist],
  };
  if (result.blocks.length > 1000 || result.checklist.length > 1000 || new TextEncoder().encode(JSON.stringify(result)).byteLength > 2_000_000) throw new Error('학습 한 개의 저장 한도를 넘습니다. 내용을 나누어 가져와 주세요.');
  return result;
}
