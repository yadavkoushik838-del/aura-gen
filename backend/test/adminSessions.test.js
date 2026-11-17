
import test from "node:test";
import assert from "node:assert/strict";

import {
  createAdminSession,
  findAdminSession,
  revokeAdminSession,
} from "../src/adminSessions.js";

function createMockCollection() {
  const documents = new Map();

  return {
    documents,

    async insertOne(document) {
      documents.set(document.tokenHash, document);
      return { acknowledged: true };
    },

    async findOne(query) {
      const document = documents.get(query.tokenHash);

      if (
        !document ||
        document.expiresAt <= query.expiresAt.$gt
      ) {
        return null;
      }

      return document;
    },

    async deleteOne(query) {
      const existed = documents.delete(query.tokenHash);

      return {
        deletedCount: existed ? 1 : 0,
      };
    },
  };
}

test("creates a session with a random token and expiry", async () => {
  const collection = createMockCollection();

  const session = await createAdminSession(
    "admin",
    collection
  );

  assert.match(session.token, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(session.expiresAt instanceof Date);
  assert.equal(collection.documents.size, 1);

  const storedDocument = [...collection.documents.values()][0];

  assert.equal(storedDocument.username, "admin");
  assert.notEqual(storedDocument.tokenHash, session.token);
});

test("finds a valid session", async () => {
  const collection = createMockCollection();

  const created = await createAdminSession(
    "admin",
    collection
  );

  const found = await findAdminSession(
    created.token,
    collection
  );

  assert.equal(found.username, "admin");
  assert.deepEqual(found.expiresAt, created.expiresAt);
});

test("rejects malformed session tokens", async () => {
  const collection = createMockCollection();

  assert.equal(
    await findAdminSession("invalid-token", collection),
    null
  );

  assert.equal(
    await revokeAdminSession("invalid-token", collection),
    false
  );
});

test("revokes an existing session", async () => {
  const collection = createMockCollection();

  const created = await createAdminSession(
    "admin",
    collection
  );

  assert.equal(
    await revokeAdminSession(created.token, collection),
    true
  );

  assert.equal(
    await findAdminSession(created.token, collection),
    null
  );
});

test("returns false when revoking an unknown session", async () => {
  const collection = createMockCollection();

  const result = await revokeAdminSession(
    "A".repeat(43),
    collection
  );

  assert.equal(result, false);
});
