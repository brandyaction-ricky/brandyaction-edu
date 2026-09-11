// The ref owns the lock synchronously, before React can render disabled buttons.
// Retrying a failed identical intent retains its ID; a completed intent gets a new ID.
export function createMutationGate<T>() {
  let flight: Promise<T> | null = null;
  let previous = '';
  let requestId = '';
  return (body: Record<string, unknown>, execute: (value: Record<string, unknown>) => Promise<T>): Promise<T> => {
    const signature = JSON.stringify(body);
    if (flight) return signature === previous ? flight : Promise.reject(new Error('진행 중인 저장이 끝난 뒤 다시 시도해 주세요.'));
    if (signature !== previous || !requestId) { previous = signature; requestId = crypto.randomUUID(); }
    flight = execute({ ...body, requestId: body.requestId || requestId }).then(result => { requestId = ''; return result; }).finally(() => { flight = null; });
    return flight;
  };
}
