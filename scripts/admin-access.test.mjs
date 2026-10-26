import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Run after `pnpm --filter @matchanimal/api build`; never modifies accounts or env.
const require = createRequire(import.meta.url);
const { isAdministrativeAccount } = require("../apps/api/dist/auth/admin-access.js");

test("admin access recognizes an exact configured user ID", () => {
  assert.equal(isAdministrativeAccount("admin-1", "member@example.test", { ADMIN_USER_IDS: " admin-1 , admin-2 " }), true);
});
test("admin access normalizes configured email casing and whitespace", () => {
  assert.equal(isAdministrativeAccount("id", " Admin@Example.test ", { ADMIN_EMAILS: "other@example.test, admin@example.test " }), true);
});
test("ordinary accounts and empty allowlists never gain admin access", () => {
  assert.equal(isAdministrativeAccount("member", "member@example.test", {}), false);
  assert.equal(isAdministrativeAccount("", "", { ADMIN_USER_IDS: ", ,", ADMIN_EMAILS: " ," }), false);
});
test("partial IDs and partial emails are rejected", () => {
  assert.equal(isAdministrativeAccount("admin", "fakeadmin@example.test", { ADMIN_USER_IDS: "admin-1", ADMIN_EMAILS: "admin@example.test" }), false);
});
