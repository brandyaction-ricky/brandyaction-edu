// Keep the fast deployment gate checks inside the existing mandatory npm test.
// These tests have no provider credentials and perform no hosted operations.
await import('../tools/release-guard/gate.test.mjs');
await import('../tools/release-guard/migrations.test.mjs');
