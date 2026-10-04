import { useState } from 'react';
import {
  AdminAlert, AdminButton, AdminCheckbox, AdminDataTable, AdminDatePicker,
  AdminDrawer, AdminEmptyState, AdminErrorState, AdminFilterBar, AdminInput,
  AdminModal, AdminPopover, AdminQuickFilter, AdminRadio,
  AdminSearchInput, AdminSelect, AdminSummaryCard, AdminSwitch, AdminTextarea,
  AdminToast, AdminTooltip, ContentContainer, PageHeader, PageSection,
  type AdminTableColumn,
} from '../../../features/admin-ui';

type Row = { id: string; name: string; count: number; status: string };
const rows: Row[] = [
  { id: 'a', name: '가나다', count: 2, status: 'submitted' },
  { id: 'b', name: '라마바', count: 1, status: 'approved' },
];
const columns: AdminTableColumn<Row>[] = [
  { id: 'name', header: '회원', value: row => row.name, sortable: true, width: '40%' },
  { id: 'count', header: '제출', value: row => row.count, sortable: true, align: 'number' },
  { id: 'status', header: '상태', status: row => ({ status: row.status }) },
  { id: 'action', header: '관리', align: 'action', render: row => <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('row-action', { detail: row.id }))}>보기</button> },
];

export function AdminComponentsFixture() {
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState('all');
  const [record, setRecord] = useState('없음');
  const [mode, setMode] = useState<'data' | 'empty' | 'loading' | 'error'>('data');
  const [drawer, setDrawer] = useState(false);
  const [modal, setModal] = useState(false);
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState('all');
  return <div className="edu-admin adm" style={{ padding: 24, minHeight: '100dvh' }}>
    <main><ContentContainer>
      <PageHeader title="컴포넌트 검증" description="합성 데이터만 사용하는 독립 테스트 화면" />
      <PageSection title="필터와 요약">
        <AdminFilterBar
          filters={<AdminSelect label="상품" labelHidden value={scope} onChange={event => setScope(event.target.value)}><option value="all">전체 상품</option><option value="course">상품 A</option></AdminSelect>}
          status={<AdminSelect label="상태" labelHidden><option>전체 상태</option><option>검토 필요</option></AdminSelect>}
          date={<AdminDatePicker label="조회일" labelHidden />}
          search={<AdminSearchInput label="회원 검색" placeholder="회원 검색" />}
          action={<AdminButton variant="primary">등록</AdminButton>}
          onReset={() => setScope('all')}
          onApply={() => setRecord('필터 적용')}
          appliedSummary="현재 표시 데이터 기준 · 합성 2건"
        />
        <AdminSummaryCard label="검토 필요" value="1건" scope="현재 페이지" compact />
        <AdminQuickFilter value={active} onChange={setActive} items={[{ value: 'all', label: '전체', count: 2 }, { value: 'pending', label: '검토 필요', count: 1 }]} />
      </PageSection>
      <PageSection title="데이터 테이블">
        <div className="admin-component-fixture-controls">
          {(['data', 'empty', 'loading', 'error'] as const).map(value => <AdminButton key={value} variant="outline" onClick={() => setMode(value)}>{value}</AdminButton>)}
        </div>
        <AdminDataTable label="합성 회원" rows={mode === 'data' ? rows : []} columns={columns} getRowId={row => row.id} rowLabel={row => row.name} onRowClick={row => setRecord(row.name)} selection={{ selectedIds: selected, onChange: setSelected, bulkActions: <AdminButton variant="ghost" onClick={() => setSelected([])}>선택 해제</AdminButton> }} loading={mode === 'loading'} error={mode === 'error' ? '일시적인 조회 오류' : undefined} empty={<AdminEmptyState title="현재 필터에 결과가 없습니다." compact />} pagination={{ page, pages: 2, total: 4, pageSize: 2, onChange: setPage, onPageSizeChange: () => {} }} />
        <p aria-live="polite">선택 행: {record}</p>
      </PageSection>
      <PageSection title="폼과 버튼">
        <div className="admin-component-fixture-controls">
          {(['primary', 'secondary', 'outline', 'ghost', 'danger'] as const).map(variant => <AdminButton key={variant} variant={variant}>{variant}</AdminButton>)}
          <AdminButton variant="primary" disabled>disabled</AdminButton>
          <AdminButton variant="primary" loading>loading</AdminButton>
        </div>
        <AdminInput label="이름" placeholder="이름" error="이름을 입력하세요" />
        <AdminTextarea label="설명" />
        <AdminCheckbox label="선택" /><AdminRadio label="옵션 A" name="sample-radio" /><AdminRadio label="옵션 B" name="sample-radio" />
        <AdminSwitch label="즉시 설정" />
      </PageSection>
      <PageSection title="피드백과 오버레이">
        <AdminAlert tone="warning" title="검토 필요">처리가 필요한 항목이 있습니다.</AdminAlert>
        <AdminErrorState onRetry={() => setRecord('재시도')}>네트워크를 확인해 주세요.</AdminErrorState>
        <AdminToast tone="success">저장되었습니다.</AdminToast>
        <div className="admin-component-fixture-controls">
          <AdminButton onClick={() => setDrawer(true)}>Drawer 열기</AdminButton>
          <AdminButton onClick={() => setModal(true)}>Modal 열기</AdminButton>
          <AdminPopover label="Popover 열기"><span>팝오버 내용</span></AdminPopover>
          <AdminTooltip content="도움말 내용"><AdminButton>Tooltip 보기</AdminButton></AdminTooltip>
        </div>
      </PageSection>
    </ContentContainer></main>
    {drawer && <AdminDrawer title="회원 상세" onClose={() => setDrawer(false)}><div className="admin-dialog-body">상세 정보</div></AdminDrawer>}
    {modal && <AdminModal title="짧은 확인" onClose={() => setModal(false)}><div className="admin-dialog-body">확인 내용</div></AdminModal>}
  </div>;
}
