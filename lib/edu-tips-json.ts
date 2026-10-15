// Used only after each endpoint's existing byte/time limits. Never normalize a
// signed body with this helper; D4 signs/verifies the original bytes separately.
export function parseStrictTipsJson(bytes: Uint8Array): unknown {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const value: unknown = JSON.parse(text);
  // JSON.parse silently keeps the last repeated member. Scan complete string
  // tokens after syntax validation so escaped names count as the same member,
  // while identical names in distinct objects remain valid.
  const tokens = [...text.matchAll(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]/g)].map(m => m[0]);
  const stack: (Set<string> | null)[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '{' || token === '[') stack.push(token === '{' ? new Set() : null);
    else if (token === '}' || token === ']') stack.pop();
    else if (token.startsWith('"') && tokens[i + 1] === ':') {
      const names = stack.at(-1), name: string = JSON.parse(token);
      if (!(names instanceof Set) || names.has(name)) throw new Error('TIPS_JSON_INVALID');
      names.add(name);
    }
  }
  const pending: unknown[] = [value];
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('TIPS_JSON_INVALID');
    if (item !== null && typeof item === 'object') for (const entry of Object.values(item)) pending.push(entry);
  }
  return value;
}
