import test from "node:test";
import assert from "node:assert/strict";
import { findOfficialMigration } from "../scripts/dev-migration-ledger.mjs";

test("matches the same version and migration name in the Supabase ledger", () => {
  const migration = { version: "20260927060000", name: "order_entry_source" };
  const official = { version: migration.version, name: migration.name };

  assert.equal(findOfficialMigration(migration, [official]), official);
});

test("matches an official entry recorded under an API-generated version", () => {
  const migration = { version: "20260929130000", name: "curriculum_week_reuse_and_restore" };
  const official = { version: "20260929060521", name: migration.name };

  assert.equal(findOfficialMigration(migration, [official]), official);
});

test("matches the repository version suffix used by the archive migration", () => {
  const migration = { version: "20260929120000", name: "product_curriculum_archive" };
  const official = {
    version: "20260929023208",
    name: "product_curriculum_archive_20260929120000",
  };

  assert.equal(findOfficialMigration(migration, [official]), official);
});

test("leaves a migration pending when no official name or version matches", () => {
  assert.equal(
    findOfficialMigration(
      { version: "20260929140000", name: "future_change" },
      [{ version: "20260929060521", name: "unrelated_change" }],
    ),
    null,
  );
});

test("fails closed when an official version is associated with another migration", () => {
  assert.throws(
    () =>
      findOfficialMigration(
        { version: "20260927060000", name: "order_entry_source" },
        [{ version: "20260927060000", name: "unexpected_migration" }],
      ),
    /not order_entry_source/,
  );
});

test("fails closed when the same migration name is officially recorded more than once", () => {
  assert.throws(
    () =>
      findOfficialMigration(
        { version: "20260929130000", name: "curriculum_week_reuse_and_restore" },
        [
          { version: "20260929060521", name: "curriculum_week_reuse_and_restore" },
          { version: "20260929060522", name: "curriculum_week_reuse_and_restore" },
        ],
      ),
    /multiple official ledger entries/,
  );
});
