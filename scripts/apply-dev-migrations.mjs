import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { migrationAction, migrationBody } from "./dev-migration-plan.mjs";

const DEV_PROJECT_REF = "vjmjhaidlqkmascdjocw";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!accessToken) {
  throw new Error("DEV_SUPABASE_ACCESS_TOKEN is required.");
}

const apiUrl = `https://api.supabase.com/v1/projects/${DEV_PROJECT_REF}/database/query`;
const migrationsDirectory = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));

async function runSql(query) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`DEV migration request failed (${response.status}): ${responseText}`);
  }

  return responseText ? JSON.parse(responseText) : [];
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

await runSql(`
  create schema if not exists dev_migrations;
  create table if not exists dev_migrations.schema_migrations (
    version text primary key,
    name text not null,
    checksum text not null,
    applied_at timestamptz not null default now()
  );
`);

const appliedRows = await runSql(
  "select version, checksum from dev_migrations.schema_migrations order by version;",
);
const appliedMigrations = new Map(appliedRows.map((row) => [row.version, row.checksum]));
const [nativeHistory] = await runSql("select to_regclass('supabase_migrations.schema_migrations') is not null as available;");
const nativeRows = nativeHistory?.available
  ? await runSql("select version, name, statements from supabase_migrations.schema_migrations;")
  : [];
const nativeMigrations = new Map(nativeRows.map(row => [row.version, row]));
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((fileName) => /^\d+_.+\.sql$/.test(fileName))
  .sort();

for (const fileName of migrationFiles) {
  const separatorIndex = fileName.indexOf("_");
  const version = fileName.slice(0, separatorIndex);
  const name = fileName.slice(separatorIndex + 1, -4);
  const sql = await readFile(`${migrationsDirectory}/${fileName}`, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const appliedChecksum = appliedMigrations.get(version);

  const action = migrationAction({ fileName, name, sql, checksum, appliedChecksum,
    nativeMigration: nativeMigrations.get(version) });
  if (action === "skip") {
    console.log(`Already applied: ${fileName}`);
    continue;
  }

  const migrationSql = action === "apply" ? migrationBody(sql) : "";
  await runSql(`
    begin;
    ${migrationSql}
    insert into dev_migrations.schema_migrations (version, name, checksum)
    values (${sqlLiteral(version)}, ${sqlLiteral(name)}, ${sqlLiteral(checksum)});
    commit;
  `);
  console.log(`${action === "apply" ? "Applied" : "Recorded verified existing Supabase migration"}: ${fileName}`);
}

console.log("DEV Supabase migrations are up to date.");
