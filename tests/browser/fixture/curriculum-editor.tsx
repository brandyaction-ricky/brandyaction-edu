import { useState } from 'react';
import { CurriculumEditor } from '../../../app/ui/final/curriculum-editor';
import '../../../app/ui/final/learning-editor.css';

export function CurriculumEditorFixture() {
  const [pending, setPending] = useState(false);
  return <main className="edu-admin" style={{ padding: 16 }}><CurriculumEditor actorId={new URLSearchParams(location.search).get('actor') || 'editor-one'} blockEditingEnabled={new URLSearchParams(location.search).has('blocks')} data={{ courses: [{ id: 'course-one', title: 'AI 문샷 챌린지' }, { id: 'course-two', title: '다른 과정' }] }} pending={pending} send={async body => {
    setPending(true);
    try { const response = await fetch('/studio-save', { method: 'POST', body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; }
    finally { setPending(false); }
  }} /></main>;
}
