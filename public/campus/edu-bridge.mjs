/** Framework-independent adapter. Mount only on the EDU origin, not file:// or a third-party iframe. */
export function createEduBridge({ fetcher = globalThis.fetch.bind(globalThis), navigate = href => globalThis.location.assign(href), onState = () => {} } = {}) {
  let controller, generation = 0, disposed = false;
  const id = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  const problem = (message, status = 0) => Object.assign(new Error(message), { status });
  function assertActive() { if (disposed) throw problem('연결이 종료되었습니다.'); }

  async function load(enrollmentId = null) {
    assertActive();
    if (enrollmentId !== null && !id(enrollmentId)) throw problem('수강권을 확인해 주세요.', 400);
    controller?.abort();
    controller = new AbortController();
    const local = controller, token = ++generation;
    onState({ status: 'loading', snapshot: null });
    try {
      const response = await fetcher('/api/campus' + (enrollmentId ? `?enrollmentId=${encodeURIComponent(enrollmentId)}` : ''), {
        credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: local.signal,
      });
      if (!response.ok) {
        const messages = { 401: '다시 로그인해 주세요.', 403: '수강 권한을 확인해 주세요.', 404: '캠퍼스 연결 준비 중입니다.' };
        throw problem(messages[response.status] || '학습 정보를 불러오지 못했습니다. 다시 시도해 주세요.', response.status);
      }
      const snapshot = await response.json();
      // A logout/scope change must not resurrect a stale in-flight response.
      if (disposed || token !== generation || local.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (snapshot?.schemaVersion !== 1 || !id(snapshot.viewer?.id) || !Array.isArray(snapshot.scopes) || !Array.isArray(snapshot.lessons)
        || snapshot.selectedEnrollmentId !== enrollmentId
        || (enrollmentId && !snapshot.scopes.some(s => s.enrollmentId === enrollmentId))) throw problem('지원하지 않는 학습 정보 형식입니다.');
      onState({ status: 'ready', snapshot });
      return snapshot;
    } catch (error) {
      if (!disposed && token === generation) onState({ status: 'error', snapshot: null, message: error.message });
      throw error;
    }
  }
  async function openLesson(enrollmentId, lessonId, missionId = null) {
    if (!id(enrollmentId) || !id(lessonId) || (missionId !== null && !id(missionId))) throw problem('수업을 확인해 주세요.', 400);
    const pending = load(enrollmentId), token = generation;
    const snapshot = await pending;
    assertActive();
    if (token !== generation) throw new DOMException('Cancelled', 'AbortError');
    const lesson = snapshot.lessons.find(l => l.id === lessonId);
    if (!lesson || (missionId && !lesson.missions.some(m => m.id === missionId))) throw problem('수업 또는 과제 공개 상태가 변경되었습니다. 목록을 새로 확인해 주세요.', 403);
    // Construct only known EDU routes; never navigate to a URL supplied by an office bot.
    navigate(`/learn/${enrollmentId}/${lessonId}` + (missionId ? `/mission?mission=${missionId}` : ''));
  }
  return {
    load,
    openLesson: (enrollmentId, lessonId) => openLesson(enrollmentId, lessonId),
    openMission: async (enrollmentId, lessonId, missionId) => {
      if (!id(missionId)) throw problem('과제를 확인해 주세요.', 400);
      return openLesson(enrollmentId, lessonId, missionId);
    },
    // Current EDU code supports the question list. Lesson-specific AI handoff is a separate QA branch.
    openQuestions: async () => {
      const pending = load(), token = generation;
      await pending;
      assertActive();
      if (token !== generation) throw new DOMException('Cancelled', 'AbortError');
      navigate('/my/questions');
    },
    dispose() { disposed = true; ++generation; controller?.abort(); onState({ status: 'closed', snapshot: null }); },
  };
}
