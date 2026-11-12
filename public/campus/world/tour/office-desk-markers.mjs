// Project only jobs belonging to occupied seats in this office.
export function makeDeskMarkers(layer, seats, profiles, jobs, openJob) {
  const markers = [];
  for (const job of jobs) {
    const profile = profiles.find(person => person.employeeId === job.employeeId);
    const desk = seats[profile?.seatIndex];
    if (!desk || !['running', 'review'].includes(job.status)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tour-hotspot office-desk-job';
    button.dataset.status = job.status;
    const label = job.status === 'review' ? '검토할 결과' : '진행 중';
    button.setAttribute('aria-label', profile.name + ' · ' + label + ' 업무 열기');
    button.textContent = (profile.seatIndex ? profile.seatIndex + '번' : '총괄') + ' · ' + label;
    button.title = profile.name + ' · ' + label;
    button.onclick = () => openJob(job.jobId);
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
  const width = 102;
  const height = 36;
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
