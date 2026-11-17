/** Enforces a byte bound while reading, including requests without Content-Length. */
export async function readLimitedUtf8Body(request: Request, limit: number): Promise<string> {
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (reader) {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) { await reader.cancel(); throw Object.assign(new Error('Too large'), { status: 400 }); }
      chunks.push(next.value);
    }
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw Object.assign(new Error('Invalid encoding'), { status: 400 }); }
}
