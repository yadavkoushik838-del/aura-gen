
import test from "node:test";
import assert from "node:assert/strict";

import {
  hashAdminPassword,
  verifyAdminPassword,
} from "../src/adminAuth.js";

test("creates a scrypt password hash", async () => {
  const hash = await hashAdminPassword("AuraGen-Secure-Test-2026!");

  assert.ok(hash.startsWith("scrypt$"));
  assert.notEqual(hash, "AuraGen-Secure-Test-2026!");
});

test("verifies the correct password", async () => {
  const password = "AuraGen-Secure-Test-2026!";
  const hash = await hashAdminPassword(password);

  assert.equal(
    await verifyAdminPassword(password, hash),
    true
  );
});

test("rejects an incorrect password", async () => {
  const hash = await hashAdminPassword("AuraGen-Secure-Test-2026!");

  assert.equal(
    await verifyAdminPassword("Wrong-Password-2026!", hash),
    false
  );
});

test("rejects malformed password hashes", async () => {
  assert.equal(
    await verifyAdminPassword("Some-Password-2026!", "invalid-hash"),
    false
  );
});

test("rejects passwords shorter than 12 characters", async () => {
  await assert.rejects(
    hashAdminPassword("short"),
    /at least 12 characters/
  );
});
