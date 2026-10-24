import {readFileSync, readdirSync} from 'node:fs';

// Only top-level statements: a GRANT quoted inside a function is not executed
// while migrating. Dollar-quoted function/DO bodies stay intact.
export function sqlStatements(sql) {
  const result = [];
  let start = 0, mode = '', tag = '';
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i], n = sql[i + 1];
    if (mode === 'line') { if (c === '\n') mode = ''; continue; }
    if (mode === 'comment') { if (c === '*' && n === '/') { mode = ''; i++; } continue; }
    if (mode === 'quote') { if (c === "'") { if (n === "'") i++; else mode = ''; } continue; }
    if (mode === 'dollar') { if (sql.startsWith(tag, i)) { i += tag.length - 1; mode = ''; } continue; }
    if (c === '-' && n === '-') { mode = 'line'; i++; continue; }
    if (c === '/' && n === '*') { mode = 'comment'; i++; continue; }
    if (c === "'") { mode = 'quote'; continue; }
    if (c === '$') {
      const m = sql.slice(i).match(/^\$[a-zA-Z_0-9]*\$/);
      if (m) { tag = m[0]; mode = 'dollar'; i += tag.length - 1; continue; }
    }
    if (c === ';') { result.push(sql.slice(start, i + 1)); start = i + 1; }
  }
  if (sql.slice(start).trim()) result.push(sql.slice(start));
  return result;
}

export const withoutComments = sql => sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
export const quote = name => '"' + name.replaceAll('"', '""') + '"';

// ACL projection, not a complete schema reset. Real migration GRANT/REVOKE and
// pure ACL loops execute against empty relations in their original creation
// order. No automatic default grants, app data, triggers, or seed side effects.
export async function replayAcl(db, migrationsUrl, contract, {exclude = ''} = {}) {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role;');
  const created = new Set();
  const aliases = {survey_report: 'survey_reports'};
  const table = async original => {
    const name = aliases[original] || original;
    const columns = contract.tables[name]?.columns || [];
    await db.exec(`create table if not exists public.${quote(name)} (${columns.map(c => quote(c) + ' text').join(',')})`);
    for (const sequence of contract.sequences) {
      if (columns.some(c => sequence.name === `${name}_${c}_seq`))
        await db.exec(`create sequence if not exists public.${quote(sequence.name)}`);
    }
    created.add(name);
  };
  for (const file of readdirSync(migrationsUrl).filter(f => f.endsWith('.sql') && f !== exclude).sort()) {
    for (const raw of sqlStatements(readFileSync(new URL(file, migrationsUrl), 'utf8'))) {
      const stmt = withoutComments(raw);
      const create = stmt.match(/^create\s+(?:or\s+replace\s+)?(?:materialized\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-zA-Z0-9_]+)/i);
      if (create) { await table(create[1]); continue; }
      const aclLoop = /^do\s+\$/i.test(stmt) && /execute\s+format\('grant all on public\.%I/i.test(stmt);
      const acl = /^(grant|revoke)\s/i.test(stmt) && !/\bon\s+(function|schema|type|database)\b/i.test(stmt) && !/\bon\s+storage\./i.test(stmt);
      if (acl || aclLoop) {
        try { await db.exec(stmt.replace(/\bpublic\.survey_report\b/g, 'public.survey_reports')); }
        catch (error) { throw new Error(`${file}: ${error.message}`, {cause: error}); }
      }
    }
  }
  return created;
}

export async function privileges(db, name, role) {
  const result = [];
  for (const privilege of ['DELETE','INSERT','SELECT','UPDATE']) {
    if ((await db.query('select has_table_privilege($1,$2,$3) as ok', [role, 'public.' + name, privilege])).rows[0].ok) result.push(privilege);
  }
  return result;
}
