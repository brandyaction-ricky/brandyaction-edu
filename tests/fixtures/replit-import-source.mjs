// Synthetic curriculum only. No real lesson text, user answers or URLs.
export const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
export function sourceFixture() {
  const date = '2026-09-07T01:00:00Z';
  const block = (id, type, content, more = {}) => ({ id, type, content, order: Number(id.split('-')[1]), ...more });
  return {
    export_type: 'curriculum_only', source_project: 'synthetic', exported_at: date,
    cohorts: [{ id: 1, name: '가상 기수', is_active: true, description: '', created_at: date }],
    days: [{ id: 1, title: '가상 실습', cohort_id: 1, day_number: 1, icon_url: null, created_at: date, updated_at: date,
      blocks: [
        block('item-2', 'text', '본문의 공백  \n\n[학습 링크](https://example.test/guide)'),
        block('item-1', 'heading', '첫 번째 제목'),
        block('item-3', 'subheading', '작은 제목'),
        block('item-4', 'question', '', { questionId: 'answer.old:1', questionType: 'text', questionLabel: '무엇을 실행하나요?' }),
        block('item-5', 'prompt', '그대로 복사할 문장\n공백  '),
        block('item-6', 'prompt_generator', '{{나의 목표}}를 위한 {고객} 안내문', { promptQuestions: ['나의 목표', '고객'], promptExamples: ['가상 목표', ''] }),
        block('item-7', 'quiz', JSON.stringify({ questions: [{ id: 'quiz.old:1', text: '다음 단계는?', options: ['계획', '실행'], correctIndex: 1 }] })),
        block('item-8', 'calculator', ''), block('item-9', 'margin_calculator', ''), block('item-10', 'funnel_builder', ''),
        block('item-11', 'persona_generator', ''), block('item-12', 'landing_funnel', ''),
        block('item-13', 'image', 'https://media.example.test/image.png'),
        block('item-14', 'video', 'https://media.example.test/movie.mp4'),
        block('item-15', 'audio', 'https://media.example.test/audio.mp3'),
        block('item-16', 'link', 'example.test/resource'), block('item-17', 'divider', ''),
        block('item-18', 'question', '', { questionId: 'answer.old:2', questionType: 'image', questionLabel: '실행 증빙' }),
      ], mission_checks: [{ id: 'check.old:1', label: '기록했습니다.', required: true }] }],
    learning_lessons: [{ id: 1, title: '별도 학습', day_number: 1, week: 1, tag: 'ai', tag_label: 'AI', time: '5분', intro: '도입 안내  ', content: '<p>본문 &amp; <strong>중요한 부분</strong><br>둘째 줄 <a href="https://example.test/learn">참고 링크</a></p><h2>중간 제목</h2><p>마지막 문단</p>', tip: '실행 팁\n그대로', quiz: [{ q: '시험 질문?', opts: ['가', '나'], ans: 1 }], is_active: false, created_at: date, updated_at: date }],
    ongoing_challenges: [{ id: 1, type: 'weekly', title: '계속 실행', description: '매주 반복', is_active: true, created_at: date, updated_at: date, blocks: [block('item-1', 'text', '반복 실습')], mission_checks: [] }],
    admin_settings: [{ id: 1, updatedAt: date, noticeBanner: null, activeCohortId: 1, mvpBorderColor: '#ff0000', autoApproveThroughWeek: 1 }],
  };
}
