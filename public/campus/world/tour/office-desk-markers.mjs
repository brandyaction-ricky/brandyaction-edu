// Project only jobs belonging to occupied seats in this office.
export function makeDeskMarkers(layer, seats, profiles, jobs, openJob) {
  const markers = [];
  for (const job of jobs) {
    const profile = profiles.find(person => person.employeeId === job.employeeId);
    const desk = seats[profile?.seatIndex];
    if (!desk || !profile.seatIndex || !['running', 'review'].includes(job.status)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tour-hotspot office-desk-job';
    button.dataset.status = job.status;
    const label = job.status === 'review' ? '검토할 결과' : '진행 중';
    button.setAttribute('aria-label', profile.name + ' · ' + label + ' 업무 열기');
    button.textContent = label;
    button.title = profile.name + ' · ' + label;
    button.onclick = () => openJob(job.jobId);
    layer.append(button);
    markers.push({b:button,item:{x:desk.x,y:desk.y,w:0,d:0,height:1.6}});
  }
  return markers;
}
