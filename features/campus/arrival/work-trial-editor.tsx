'use client';

import {AdminInput, AdminTextarea} from '@/features/admin-ui/components/admin-system';
import {EditorDisclosure} from '../content/disclosure';
import {WORK_TRIAL_LIMITS as limits, type WorkTrialConfig} from './work-trial';
import styles from './editor.module.css';

/** Uses the enclosing webinar form's save, revision checks and preview. */
export function WorkTrialEditor({value, onChange, disabled = false}: {
  value: WorkTrialConfig;
  onChange: (value: WorkTrialConfig) => void;
  disabled?: boolean;
}) {
  function patch<K extends keyof WorkTrialConfig>(key: K, next: WorkTrialConfig[K]) {
    onChange({...value, [key]: next});
  }
  function task(which: 'firstTask' | 'secondTask', key: keyof WorkTrialConfig['firstTask'], next: string) {
    patch(which, {...value[which], [key]: next});
  }

  return <div className={styles.workEditor} aria-label="직장인 업무 기준 체험 편집">
    <div className={styles.groupHeading}>
      <h4>직장인 · 업무 기준과 반복 실행</h4>
      <p>방문자가 개인 AI에서 첫 업무를 실행하고, 직접 고친 기준을 두 번째 업무에 다시 쓰는 체험입니다. 예시 자료와 안내, AI에게 보낼 요청문을 단계별로 편집하세요.</p>
    </div>

    <EditorDisclosure title="1단계 · 내 업무 기준 만들기" initialOpen>
      <fieldset disabled={disabled} className={styles.fields}>
        <AdminTextarea label="업무 기준 화면 제목" required rows={2} maxLength={limits.title} value={value.title} onChange={event => patch('title', event.target.value)}/>
        <AdminTextarea label="업무 기준 화면 안내" required rows={3} maxLength={limits.description} value={value.description} onChange={event => patch('description', event.target.value)}/>
        <div className={styles.grid}>
          <AdminInput label="맡길 역할 · 질문" required maxLength={limits.label} value={value.roleLabel} onChange={event => patch('roleLabel', event.target.value)}/>
          <AdminTextarea label="맡길 역할 · 예시" required rows={2} maxLength={limits.role} value={value.roleDefault} onChange={event => patch('roleDefault', event.target.value)}/>
          <AdminInput label="읽는 사람과 목적 · 질문" required maxLength={limits.label} value={value.readerLabel} onChange={event => patch('readerLabel', event.target.value)}/>
          <AdminTextarea label="읽는 사람과 목적 · 예시" required rows={2} maxLength={limits.reader} value={value.readerDefault} onChange={event => patch('readerDefault', event.target.value)}/>
        </div>
        <AdminTextarea label="우선순위를 고르는 질문" required rows={2} maxLength={limits.label} value={value.priorityQuestion} onChange={event => patch('priorityQuestion', event.target.value)}/>
        <p className={styles.scope}>선택지 이름은 방문자 화면에, 선택한 업무 기준은 AI에게 전달할 매뉴얼에 들어갑니다.</p>
        {value.priorities.map((priority, index) => <div className={styles.grid} key={priority.id}>
          <AdminInput label={`우선순위 선택지 ${index + 1}`} required maxLength={limits.label} value={priority.label} onChange={event => patch('priorities', value.priorities.map((item, itemIndex) => itemIndex === index ? {...item, label: event.target.value} : item))}/>
          <AdminTextarea label={`선택지 ${index + 1}을 고르면 적용할 업무 기준`} required rows={3} maxLength={limits.rule} value={priority.rule} onChange={event => patch('priorities', value.priorities.map((item, itemIndex) => itemIndex === index ? {...item, rule: event.target.value} : item))}/>
        </div>)}
        <div className={styles.grid}>
          <AdminInput label="확인이 필요한 상황 · 질문" required maxLength={limits.label} value={value.boundaryLabel} onChange={event => patch('boundaryLabel', event.target.value)}/>
          <AdminTextarea label="확인이 필요한 상황 · 예시 기준" required rows={3} maxLength={limits.rule} value={value.boundaryDefault} onChange={event => patch('boundaryDefault', event.target.value)}/>
          <AdminInput label="완료 기준 · 질문" required maxLength={limits.label} value={value.formatLabel} onChange={event => patch('formatLabel', event.target.value)}/>
          <AdminTextarea label="완료 기준 · 예시" required rows={3} maxLength={limits.rule} value={value.formatDefault} onChange={event => patch('formatDefault', event.target.value)}/>
        </div>
      </fieldset>
    </EditorDisclosure>

    <EditorDisclosure title="2단계 · 첫 업무 실행">
      <fieldset disabled={disabled} className={styles.fields}>
        <AdminTextarea label="첫 업무 화면 제목" required rows={2} maxLength={limits.title} value={value.firstTask.title} onChange={event => task('firstTask', 'title', event.target.value)}/>
        <AdminTextarea label="첫 업무 화면 안내" required rows={3} maxLength={limits.description} value={value.firstTask.description} onChange={event => task('firstTask', 'description', event.target.value)}/>
        <AdminInput label="첫 업무 자료 · 입력 질문" required maxLength={limits.label} value={value.firstTask.label} onChange={event => task('firstTask', 'label', event.target.value)}/>
        <AdminTextarea label="첫 업무 자료 · 입력 도움말" required rows={2} maxLength={limits.hint} value={value.firstTask.hint} onChange={event => task('firstTask', 'hint', event.target.value)}/>
        <AdminTextarea label="첫 업무 · 체험용 예시 자료" required rows={7} maxLength={limits.task} value={value.firstTask.sample} onChange={event => task('firstTask', 'sample', event.target.value)} helper="방문자가 ‘예시 자료 사용’을 선택하면 입력됩니다. 실제 고객 정보나 회사 기밀을 넣지 마세요."/>
        <EditorDisclosure title="AI에게 보낼 첫 업무 요청문">
          <AdminTextarea label="첫 업무 요청문 틀" required rows={8} maxLength={limits.template} value={value.firstTemplate} onChange={event => patch('firstTemplate', event.target.value)} helper="{{manual}}에는 방문자가 정한 업무 기준, {{task}}에는 첫 업무 자료가 들어갑니다. 두 표시를 모두 유지하세요."/>
        </EditorDisclosure>
      </fieldset>
    </EditorDisclosure>

    <EditorDisclosure title="3단계 · 피드백을 업무 기준에 반영">
      <fieldset disabled={disabled} className={styles.fields}>
        <AdminTextarea label="피드백 화면 제목" required rows={2} maxLength={limits.title} value={value.feedback.title} onChange={event => patch('feedback', {...value.feedback, title: event.target.value})}/>
        <AdminTextarea label="피드백 화면 안내" required rows={3} maxLength={limits.description} value={value.feedback.description} onChange={event => patch('feedback', {...value.feedback, description: event.target.value})}/>
        <AdminTextarea label="피드백 입력 도움말" required rows={3} maxLength={limits.hint} value={value.feedback.hint} onChange={event => patch('feedback', {...value.feedback, hint: event.target.value})}/>
        {value.feedback.suggestions.map((suggestion, index) => <AdminTextarea key={index} label={`피드백 예시 ${index + 1}`} required rows={2} maxLength={limits.feedback} value={suggestion} onChange={event => patch('feedback', {...value.feedback, suggestions: value.feedback.suggestions.map((item, itemIndex) => itemIndex === index ? event.target.value : item)})}/>)}
        <EditorDisclosure title="AI에게 보낼 피드백 요청문">
          <AdminTextarea label="피드백 요청문 틀" required rows={8} maxLength={limits.template} value={value.updateTemplate} onChange={event => patch('updateTemplate', event.target.value)} helper="{{manual}}은 보완한 업무 기준, {{task}}는 첫 업무 자료, {{feedback}}은 방문자가 직접 적은 피드백입니다. 세 표시를 모두 유지하세요."/>
        </EditorDisclosure>
      </fieldset>
    </EditorDisclosure>

    <EditorDisclosure title="4단계 · 두 번째 업무에 재사용">
      <fieldset disabled={disabled} className={styles.fields}>
        <AdminTextarea label="두 번째 업무 화면 제목" required rows={2} maxLength={limits.title} value={value.secondTask.title} onChange={event => task('secondTask', 'title', event.target.value)}/>
        <AdminTextarea label="두 번째 업무 화면 안내" required rows={3} maxLength={limits.description} value={value.secondTask.description} onChange={event => task('secondTask', 'description', event.target.value)}/>
        <AdminInput label="두 번째 업무 자료 · 입력 질문" required maxLength={limits.label} value={value.secondTask.label} onChange={event => task('secondTask', 'label', event.target.value)}/>
        <AdminTextarea label="두 번째 업무 자료 · 입력 도움말" required rows={2} maxLength={limits.hint} value={value.secondTask.hint} onChange={event => task('secondTask', 'hint', event.target.value)}/>
        <AdminTextarea label="두 번째 업무 · 체험용 예시 자료" required rows={7} maxLength={limits.task} value={value.secondTask.sample} onChange={event => task('secondTask', 'sample', event.target.value)} helper="첫 업무와 다른 자료를 넣어주세요. 보완한 업무 기준이 새로운 상황에도 적용되는지 확인합니다."/>
        <EditorDisclosure title="AI에게 보낼 재사용 요청문">
          <AdminTextarea label="두 번째 업무 요청문 틀" required rows={8} maxLength={limits.template} value={value.reuseTemplate} onChange={event => patch('reuseTemplate', event.target.value)} helper="{{manual}}에는 피드백까지 반영한 기준, {{task}}에는 두 번째 업무 자료가 들어갑니다. 두 표시를 모두 유지하세요."/>
        </EditorDisclosure>
        <div className={styles.groupHeading}><h4>체험 후 확인과 라이브 안내</h4><p>체험 결과는 방문자가 직접 확인합니다. 캠퍼스가 개인 AI의 답변을 읽거나 채점하지 않습니다.</p></div>
        <AdminTextarea label="체험 정리 화면 제목" required rows={2} maxLength={limits.title} value={value.summaryTitle} onChange={event => patch('summaryTitle', event.target.value)}/>
        <AdminTextarea label="체험 정리 화면 안내" required rows={3} maxLength={limits.description} value={value.summaryDescription} onChange={event => patch('summaryDescription', event.target.value)}/>
        {value.checks.map((check, index) => <AdminTextarea key={index} label={`방문자가 확인할 항목 ${index + 1}`} required rows={2} maxLength={limits.rule} value={check} onChange={event => patch('checks', value.checks.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}/>)}
        <AdminTextarea label="체험에서 라이브로 이어지는 안내" required rows={4} maxLength={limits.description} value={value.liveBridge} onChange={event => patch('liveBridge', event.target.value)} helper="일정과 라이브 링크는 아래 ‘라이브 안내 · 일정 저장’에서 공통으로 관리합니다."/>
      </fieldset>
    </EditorDisclosure>
  </div>;
}
