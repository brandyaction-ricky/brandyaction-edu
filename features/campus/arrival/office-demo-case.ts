import {welcomeCase} from './case-data';
import {DEFAULT_OFFICE_DEMO, type OfficeDemoChoice, type OfficeDemoConfig} from './office-demo';

type CaseChoice = OfficeDemoConfig['choices'][number] & {approvedAnswer: string};

// Earlier event records can contain the previous campaign defaults alongside edited fields.
export function officeCaseContent(demo: OfficeDemoConfig) {
  const original = DEFAULT_OFFICE_DEMO;
  function choice(index: OfficeDemoChoice): CaseChoice {
    const saved = demo.choices[index], previous = original.choices[index], example = welcomeCase.rules[index];
    return {
      feedback: saved.feedback === previous.feedback ? example.label : saved.feedback,
      revised: saved.revised === previous.revised ? example.approvedIntro : saved.revised,
      rule: saved.rule === previous.rule ? example.label : saved.rule,
      approvedAnswer: saved.approvedAnswer || example.approvedAnswer,
    };
  }
  const choices: [CaseChoice, CaseChoice] = [choice(0), choice(1)];
  return {
    ...demo,
    greeting: [original.greeting, '우리 팀이 만든 광고부터 보실래요?'].includes(demo.greeting)
      ? 'AI봇들과 함께 일하면 어떻게 될까요?' : demo.greeting,
    brief: demo.brief === original.brief ? welcomeCase.positioning : demo.brief,
    material: demo.material === original.material ? welcomeCase.sources.map(source => source.label).join(' · ') : demo.material,
    draft: demo.draft === original.draft ? welcomeCase.intro : demo.draft,
    choices,
  };
}

/** A local change detector for the text being reviewed, not an authorization token. */
export function officeCaseRevision(demo: OfficeDemoConfig): string {
  const {brief, material, draft, choices} = officeCaseContent(demo);
  const copy = JSON.stringify([brief, material, draft, choices.map(({feedback, revised, rule, approvedAnswer}) =>
    [feedback, revised, rule, approvedAnswer])]);
  let hash = 2166136261;
  for (let index = 0; index < copy.length; index++) hash = Math.imul(hash ^ copy.charCodeAt(index), 16777619);
  return `office-case-v1-${(hash >>> 0).toString(36)}`;
}
