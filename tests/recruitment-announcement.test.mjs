import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync(new URL('../lib/recruitment-announcement.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const announcement = {};
new Function('exports', code)(announcement);

test('announcement replaces recurring dates and materials without retaining old campaign details', () => {
  const values = { ...announcement.emptyRecruitmentAnnouncement,
    material1: '첫 자료', material2: '둘째 자료', material3: '셋째 자료', material2Date: '10일', material3Date: '20일',
    materialsUrl: 'https://example.test/materials', liveDate: '10/30 (금)', liveTime: '오후 8시',
    bonus1: '첫 혜택', bonus2: '둘째 혜택', bonus3: '셋째 혜택', passwordUrl: 'https://example.test/password',
  };
  const result = announcement.recruitmentAnnouncement(values);
  assert.equal(announcement.incompleteRecruitmentAnnouncement(values), false);
  assert.equal((result.match(/10\/30 \(금\)/g) || []).length, 4);
  assert.match(result, /둘째 자료 \(10일 공개\)/);
  assert.match(result, /셋째 혜택/);
  assert.match(result, /https:\/\/example\.test\/password/);
  assert.doesNotMatch(result, /9\/28|edu\.brandyaction\.com/);
});

test('empty fields are visible placeholders before copying', () => {
  assert.equal(announcement.incompleteRecruitmentAnnouncement(announcement.emptyRecruitmentAnnouncement), true);
  assert.match(announcement.recruitmentAnnouncement(announcement.emptyRecruitmentAnnouncement), /\[라이브 날짜\]/);
});
