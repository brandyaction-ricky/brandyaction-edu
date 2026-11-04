const BUSINESS_LABELS = Object.freeze({
  complete_verified: '완료 확인',
  in_progress_reported: '진행 중으로 보고됨',
  not_due: '예정 시각 전',
  report_missing: '보고 미수신',
  failure_verified: '실패 확인',
  unknown: '확인 불가',
  paused: '일시 중지',
  not_scheduled: '예약 없음',
  manual_unrequested: '수동 업무 · 요청 전',
  not_applicable: '해당 없음'
});

export function businessLabel(state) {
  return Object.hasOwn(BUSINESS_LABELS, state) ? BUSINESS_LABELS[state] : '확인 불가';
}

const APPLICATION_LABELS = Object.freeze({
  unverified: '실제 적용 미확인',
  record_confirmed: '실제 적용 기록 확인',
  not_applicable: '이번 보고의 적용 대상 아님'
});

export function applicationLabel(state) {
  return Object.hasOwn(APPLICATION_LABELS, state) ? APPLICATION_LABELS[state] : '실제 적용 미확인';
}

// A full catalog can be read without putting every imported employee in the room.
// Omitting office keeps the adapter useful for full-roster consumers.
export function toOfficeSessions(snapshot, office) {
  const managed = office !== undefined;
  const capacity = Number.isInteger(office?.capacity) && office.capacity > 0 ? office.capacity : 8;
  const catalog = new Map((snapshot?.employees || []).map(employee => [employee.employeeId, employee]));
  const placements = managed ? (Array.isArray(office?.placements) ? office.placements : []) : [...catalog.keys()].map(employeeId => ({ employeeId }));
  const sessions = new Map();
  const seats = new Set();
  for (const placement of placements) {
    const employee = catalog.get(placement.employeeId);
    if (!employee || sessions.has(employee.employeeId)) continue;
    if (managed && (!Number.isInteger(placement.seatIndex) || placement.seatIndex < 0 || placement.seatIndex >= capacity || seats.has(placement.seatIndex))) continue;
    if (managed && placement.seatIndex === 0 && employee.employeeId !== office?.managerEmployeeId) continue;
    const key = JSON.stringify([snapshot.companyId, employee.employeeId]);
    const checked = employee.business.checkedAt;
    sessions.set(employee.employeeId, {
      key,
      employeeId: employee.employeeId,
      companyId: snapshot.companyId,
      name: employee.name,
      fullName: employee.name,
      project: employee.name,
      role: employee.role,
      agent: 'present',
      status: 'present',
      activity: null,
      title: employee.business.summary,
      appearanceSeed: placement.appearanceSeed ?? key,
      seatIndex: placement.seatIndex,
      startedAt: 0,
      lastEventAt: checked ? Date.parse(checked) : 0,
      subagent: false
    });
    seats.add(placement.seatIndex);
  }
  if (managed && !seats.has(0)) {
    sessions.set(null, {
      key: JSON.stringify([snapshot?.companyId || 'office', null, 'manager-seat']),
      employeeId: null, companyId: snapshot?.companyId || null,
      name: '총괄관리자 자리', fullName: '총괄관리자 자리', role: '자료 연결 대기',
      placeholder: true, appearanceSeed: 'fixed-manager-seat', seatIndex: 0,
      project: '총괄관리자 자리', agent: 'present', status: 'present',
      activity: null, title: null, startedAt: 0, lastEventAt: 0, subagent: false
    });
  }
  return [...sessions.values()].sort((a, b) => (a.seatIndex ?? 0) - (b.seatIndex ?? 0));
}

// Bot registrations have their own local display state; no report is required.
export function toBotOfficeSessions(document) {
  return (document?.profiles || []).map(profile => ({
    key: JSON.stringify(['local-bot', profile.employeeId]),
    employeeId: profile.employeeId,
    name: profile.name,
    fullName: profile.name,
    project: profile.name,
    role: profile.employeeId === 'manager' ? '총괄관리자' : '텔레그램 직원',
    agent: 'present', status: 'present', activity: null,
    title: profile.duties || null,
    appearanceSeed: profile.appearanceSeed,
    seatIndex: profile.seatIndex,
    startedAt: 0, lastEventAt: 0, subagent: false,
  })).sort((a, b) => a.seatIndex - b.seatIndex);
}
