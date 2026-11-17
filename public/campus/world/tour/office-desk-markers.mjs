// One marker per occupied seat. A desk with work in progress or a result to review opens that job;
// with openEmployee, an idle desk also gets a quiet name tag that opens the employee's status card.
export function makeDeskMarkers(layer, seats, profiles, jobs, openJob, openEmployee) {
  const markers = [];
  for (const profile of profiles) {
    const desk = seats[profile?.seatIndex];
    if (!desk) continue;
    const job = jobs.find(item => item.employeeId === profile.employeeId && ['running', 'review'].includes(item.status));
    if (!job && !openEmployee) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tour-hotspot office-desk-job';
    button.dataset.status = job ? job.status : 'idle';
    const label = !job ? '대기 중' : job.status === 'review' ? '검토할 결과' : '진행 중';
    button.setAttribute('aria-label', profile.name + (job ? ' · ' + label + ' 업무 열기' : ' 상태 보기'));
    // Show who it is, not the seat number: the name on top, the status under it.
    const who = document.createElement('strong'), what = document.createElement('small');
    who.textContent = profile.name; what.textContent = label;
    button.append(who, what);
    button.title = profile.name + ' · ' + label;
    button.onclick = () => job ? openJob(job.jobId) : openEmployee(profile.employeeId);
    layer.append(button);
    markers.push({b:button,wing:desk.wing,item:{x:desk.x,y:desk.y,w:0,d:0,height:1.6}});
  }
  return markers;
}

// Leave the middle of the room free for the avatar and the general office controls.
export function positionDeskMarkers(office, markers) {
  const wings = {left: [], right: []};
  for (const {b, item, wing} of markers) {
    const point = office.projectInteriorPoint(item);
    b.hidden = !point;
    if (point) wings[wing].push({b, ...point});
  }
  // Narrow screens get a smaller, name-only marker (status stays in the color) so ten desks do not cover the room.
  const compact = office.cw < 560;
  const width = compact ? 92 : 128;
  const height = compact ? 28 : 42;
  for (const {b} of markers) b.dataset.compact = String(compact);
  for (const [wing, group] of Object.entries(wings)) {
    if (!group.length) continue;
    group.sort((a, b) => a.y - b.y);
    const edge = wing === 'left' ? Math.min(...group.map(p => p.x)) - width - 12
                                 : Math.max(...group.map(p => p.x)) + 12;
    const x = Math.max(6, Math.min(office.cw - width - 6, edge));
    let previousBottom = -Infinity;
    for (const point of group) {
      const y = Math.max(previousBottom + 4, point.y - height);
      const start = wing === 'left' ? width : 0;
      const dx = point.x - x - start;
      const dy = point.y - y - height / 2;
      point.b.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      point.b.style.setProperty('--line-start', start + 'px');
      point.b.style.setProperty('--line-length', Math.hypot(dx, dy) + 'px');
      point.b.style.setProperty('--line-angle', Math.atan2(dy, dx) + 'rad');
      previousBottom = y + height;
    }
  }
}
