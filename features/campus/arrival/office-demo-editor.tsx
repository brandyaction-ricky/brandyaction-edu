import {AdminInput, AdminTextarea} from '@/features/admin-ui/components/admin-system';
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
  function setText(field: Exclude<keyof OfficeDemoConfig, 'choices'>, text: string) {
    onChange({...value, [field]: text});
  }
  function setChoice(index: number, field: keyof FeedbackChoice, text: string) {
    const choices: OfficeDemoConfig['choices'] = [...value.choices];
    choices[index] = {...choices[index], [field]: text};
    onChange({...value, choices});
  }

  return <fieldset className={styles.fields} disabled={disabled} aria-label="광고 직원 체험 편집">
    <div className={styles.grid}>
      <AdminTextarea label="팀장의 첫 인사" required rows={2} maxLength={limits.greeting} value={shown.greeting} onChange={e => setText('greeting', e.target.value)}/>
      <AdminInput label="직원 책상 말풍선" required maxLength={limits.deskLabel} value={value.deskLabel} onChange={e => setText('deskLabel', e.target.value)}/>
    </div>
    <AdminTextarea label="직원이 맡은 일" required rows={2} maxLength={limits.brief} value={shown.brief} onChange={e => setText('brief', e.target.value)}/>
    <AdminTextarea label="직원이 참고한 자료" required rows={3} maxLength={limits.material} value={shown.material} onChange={e => setText('material', e.target.value)}/>
    <AdminTextarea label="처음 보여줄 광고 초안" required rows={2} maxLength={limits.draft} value={shown.draft} onChange={e => setText('draft', e.target.value)}/>
    {value.choices.map((choice, index) => <EditorDisclosure key={index} title={index === 0 ? '첫 번째 수정 요청과 결과' : '두 번째 수정 요청과 결과'}>
      <div className={styles.fields}>
        <AdminInput label={`피드백 ${index + 1} · 방문자가 고를 문구`} required maxLength={limits.feedback} value={shown.choices[index].feedback} onChange={e => setChoice(index, 'feedback', e.target.value)}/>
        <AdminTextarea label={`피드백 ${index + 1} · 수정한 광고 문구`} required rows={2} maxLength={limits.revised} value={shown.choices[index].revised} onChange={e => setChoice(index, 'revised', e.target.value)}/>
        <AdminTextarea label={`피드백 ${index + 1} · 승인 후 남길 업무 기준`} required rows={2} maxLength={limits.rule} value={shown.choices[index].rule} onChange={e => setChoice(index, 'rule', e.target.value)}/>
        <AdminTextarea label={`피드백 ${index + 1} · 같은 기준을 적용한 문의 답변`} helper="비워 두면 사례의 기본 답변을 사용합니다." rows={3} maxLength={limits.approvedAnswer} value={choice.approvedAnswer ?? shown.choices[index].approvedAnswer} onChange={e => setChoice(index, 'approvedAnswer', e.target.value)}/>
      </div>
    </EditorDisclosure>)}
    <AdminTextarea label="승인 후 팀이 들려줄 이야기" required rows={3} maxLength={limits.teamNote} value={value.teamNote} onChange={e => setText('teamNote', e.target.value)}/>
  </fieldset>;
}
