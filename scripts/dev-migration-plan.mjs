// Keep SQL text exact: whitespace inside a function or literal is significant.
export function migrationBody(sql) {
  return sql.replace(/^\s*begin\s*;\s*$/gim, "")
    .replace(/^\s*commit\s*;\s*$/gim, "").trim();
}

export function migrationAction({ fileName, name, sql, checksum, appliedChecksum, nativeMigration }) {
  if (appliedChecksum !== undefined) {
    if (appliedChecksum !== checksum) {
      throw new Error(`${fileName} changed after it was applied. Add a new migration instead.`);
    }
    return "skip";
  }
  if (!nativeMigration) return "apply";
  if (nativeMigration.name !== name || !Array.isArray(nativeMigration.statements)
    || !nativeMigration.statements.length
    || !nativeMigration.statements.every(statement => typeof statement === "string")
    || migrationBody(nativeMigration.statements.join("\n")) !== migrationBody(sql)) {
    throw new Error(`${fileName} conflicts with Supabase migration history. Reconcile the verified migration before deploying.`);
  }
  return "record-existing";
}
