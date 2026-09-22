export function reviewQuery(params: URLSearchParams) {
  const submission = params.get('submission');
  const status = params.get('status') ?? (submission ? '' : 'submitted');
  const query = (params.get('query') || '').trim();
  const sort = params.get('sort') || 'old';
  const page = Number(params.get('page') || 1);
  if (!['', 'submitted', 'approved', 'changes_requested', 'rejected'].includes(status)
    || !['old', 'new'].includes(sort) || query.length > 200
    || !Number.isSafeInteger(page) || page < 1 || page > 100000
    || (submission !== null && !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(submission))) {
    throw new Error('조회 조건을 확인해 주세요.');
  }
  return { status, query, sort, page, submission };
}
