import {AdminTextarea} from '@/features/admin-ui/components/admin-system';
import {EditorDisclosure} from '../content/disclosure';
import {OFFICE_DEMO_LIMITS as limits, type OfficeDemoConfig} from './office-demo';
import {officeCaseContent} from './office-demo-case';
import styles from './editor.module.css';

type Props = {
  value: OfficeDemoConfig;
  onChange: (next: OfficeDemoConfig) => void;
  disabled: boolean;
};

type FeedbackChoice = OfficeDemoConfig['choices'][number];

export function OfficeDemoEditor({value, onChange, disabled}: Props) {
  const shown = officeCaseContent(value);
  function setText(field: 'greeting' | 'draft', text: string) {
    onChange({...value, [field]: text});
  }
  function setChoice(index: number, field: keyof FeedbackChoice, text: string) {
    const choices: OfficeDemoConfig['choices'] = [...value.choices];
    choices[index] = {...choices[index], [field]: text};
    onChange({...value, choices});
  }

  return <fieldset className={styles.fields} disabled={disabled} aria-label="팀장 안내와 정본 체험 편집">
    <p className={styles.scope}>경쟁사 스파이의 예시 대화와 콘텐츠 담당자의 영상은 이 미리보기에 준비된 사례입니다.</p>
    <AdminTextarea label="팀장의 첫 인사" required rows={2} maxLength={limits.greeting} value={shown.greeting} onChange={e => setText('greeting', e.target.value)}/>
    <AdminTextarea label="기준을 적용하기 전 소개글 초안" required rows={2} maxLength={limits.draft} value={shown.draft} onChange={e => setText('draft', e.target.value)}/>
    {value.choices.map((choice, index) => <EditorDisclosure key={index} title={index === 0 ? '첫 번째 회사 기준과 예시' : '두 번째 회사 기준과 예시'}>
      <div className={styles.fields}>
        <AdminTextarea label="방문자가 고를 업무 기준" required rows={2} maxLength={limits.rule} value={shown.choices[index].rule} onChange={e => setChoice(index, 'rule', e.target.value)}/>
        <AdminTextarea label="기준을 적용한 소개글" required rows={2} maxLength={limits.revised} value={shown.choices[index].revised} onChange={e => setChoice(index, 'revised', e.target.value)}/>
        <AdminTextarea label="같은 기준을 적용한 문의 답변" helper="비워 두면 사례의 기본 답변을 사용합니다." rows={3} maxLength={limits.approvedAnswer} value={choice.approvedAnswer ?? shown.choices[index].approvedAnswer} onChange={e => setChoice(index, 'approvedAnswer', e.target.value)}/>
      </div>
    </EditorDisclosure>)}
  </fieldset>;
}
