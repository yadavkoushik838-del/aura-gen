
import {
  createHash,
  randomBytes,
} from "node:crypto";

import {
  getAdminSessionsCollection,
} from "./database.js";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function hashToken(token) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

export async function createAdminSession(
  username,
  sessions
) {
  const collection =
    sessions ?? getAdminSessionsCollection();

  const token = randomBytes(32).toString("base64url");

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + SESSION_DURATION_MS
  );

  await collection.insertOne({
    tokenHash: hashToken(token),
    username,
    createdAt: now,
    expiresAt,
  });

  return {
    token,
    expiresAt,
  };
}

export async function findAdminSession(
  token,
  sessions
) {
  // Reject missing or malformed tokens before accessing MongoDB.
  if (
    typeof token !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(token)
  ) {
    return null;
  }

  const collection =
    sessions ?? getAdminSessionsCollection();

  const session = await collection.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  });

  if (!session) {
    return null;
  }

  return {
    username: session.username,
    expiresAt: session.expiresAt,
  };
}

export async function revokeAdminSession(
  token,
  sessions
) {
  // Invalid tokens require no database operation.
  if (
    typeof token !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(token)
  ) {
    return false;
  }

  const collection =
    sessions ?? getAdminSessionsCollection();

  const result = await collection.deleteOne({
    tokenHash: hashToken(token),
  });

  return result.deletedCount === 1;
}
