export function findOfficialMigration(migration, officialMigrations) {
  const expectedNames = new Set([migration.name, `${migration.name}_${migration.version}`]);
  const sameVersion = officialMigrations.find((row) => row.version === migration.version);

  if (sameVersion) {
    if (!expectedNames.has(sameVersion.name)) {
      throw new Error(
        `DEV migration version ${migration.version} is recorded as ${sameVersion.name}, not ${migration.name}.`,
      );
    }
    return sameVersion;
  }

  const sameName = officialMigrations.filter((row) => expectedNames.has(row.name));
  if (sameName.length > 1) {
    throw new Error(`DEV migration ${migration.name} has multiple official ledger entries.`);
  }

  return sameName[0] ?? null;
}
