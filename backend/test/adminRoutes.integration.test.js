
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

import { createAdminRouter } from "../src/adminRoutes.js";
import { hashAdminPassword } from "../src/adminAuth.js";

const ALLOWED_ORIGIN = "http://localhost:3001";
const ADMIN_USERNAME = "test-admin";
const ADMIN_PASSWORD = "Test-Admin-Password-2026";

const sessions = new Map();

let server;
let baseUrl;
let loginCookie;
let loginResponse;
let loginPayload;

const sampleApplications = [
  {
    _id: "mongo-1",
    applicationId: "AG-001",
    fullName: "Alice Example",
    email: "alice@example.com",
    employment: "Employed",
    annualIncome: "600000",
    submittedAt: new Date("2026-11-25T10:00:00Z"),
    status: "submitted",
  },
  {
    _id: "mongo-2",
    applicationId: "AG-002",
    fullName: "Bob Example",
    email: "bob@example.com",
    employment: "Self-employed",
    annualIncome: "800000",
    submittedAt: new Date("2026-11-26T10:00:00Z"),
    status: "submitted",
  },
  {
    _id: "mongo-3",
    applicationId: "AG-003",
    fullName: "Charlie Example",
    email: "charlie@example.com",
    employment: "Student",
    annualIncome: "200000",
    submittedAt: new Date("2026-11-27T10:00:00Z"),
    status: "submitted",
  },
];

function createMockApplications() {
  return {
    find() {
      let records = [...sampleApplications];
      let skipCount = 0;
      let limitCount = records.length;
      let projection = null;

      const cursor = {
        sort() {
          records.sort(
            (a, b) =>
              b.submittedAt.getTime() -
              a.submittedAt.getTime()
          );

          return cursor;
        },

        skip(value) {
          skipCount = value;
          return cursor;
        },

        limit(value) {
          limitCount = value;
          return cursor;
        },

        project(value) {
          projection = value;
          return cursor;
        },

        async toArray() {
          const selected = records.slice(
            skipCount,
            skipCount + limitCount
          );

          if (!projection) {
            return selected;
          }

          const includedFields = Object.keys(projection)
            .filter((key) => projection[key] === 1);

          return selected.map((record) => {
            const result = {};

            for (const field of includedFields) {
              if (field in record) {
                result[field] = record[field];
              }
            }

            return result;
          });
        },
      };

      return cursor;
    },

    async countDocuments() {
      return sampleApplications.length;
    },
  };
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Origin: ALLOWED_ORIGIN,
      ...(options.headers || {}),
    },
  });
}

async function loginWithCredentials(
  username,
  password
) {
  return request("/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });
}

async function authenticatedRequest(path, options = {}) {
  return request(path, {
    ...options,
    headers: {
      Cookie: loginCookie,
      ...(options.headers || {}),
    },
  });
}

before(async () => {
  const passwordHash = await hashAdminPassword(
    ADMIN_PASSWORD
  );

  const adminConfig = {
    nodeEnv: "test",
    adminUsername: ADMIN_USERNAME,
    adminPasswordHash: passwordHash,
  };

  let tokenCounter = 0;

  const createSession = async (username) => {
    tokenCounter += 1;

    const token = Buffer.alloc(
      32,
      tokenCounter
    ).toString("base64url");

    const session = {
      token,
      username,
      expiresAt: new Date(
        Date.now() + 8 * 60 * 60 * 1000
      ),
    };

    sessions.set(token, session);

    return session;
  };

  const findSession = async (token) => {
    if (!token) {
      return null;
    }

    const session = sessions.get(token);

    if (
      !session ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      return null;
    }

    return session;
  };

  const revokeSession = async (token) => {
    return sessions.delete(token);
  };

  const logger = {
    info() {},
    warn() {},
    error() {},
  };

  const app = express();

  app.use(express.json());

  app.use(
    "/api/admin",
    createAdminRouter({
      isAllowedOrigin: (origin) =>
        origin === ALLOWED_ORIGIN,
      logger,
      adminConfig,
      createSession,
      findSession,
      revokeSession,
      getApplications: createMockApplications,
    })
  );

  server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.once("error", reject);

    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  baseUrl = `http://127.0.0.1:${address.port}/api/admin`;

  // Create one authenticated session for protected-route tests.
  loginResponse = await loginWithCredentials(
    ADMIN_USERNAME,
    ADMIN_PASSWORD
  );

  loginPayload = await loginResponse.json();

  const setCookie = loginResponse.headers.get("set-cookie");

  assert.ok(setCookie, "Login should set a session cookie.");

  loginCookie = setCookie.split(";")[0];
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});

test("admin login succeeds with valid credentials", () => {
  assert.equal(loginResponse.status, 200);
  assert.equal(loginPayload.status, "authenticated");
  assert.equal(loginPayload.username, ADMIN_USERNAME);
  assert.ok(loginPayload.expiresAt);

  const cookie = loginResponse.headers.get("set-cookie");

  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Path=\/api\/admin/i);
  assert.match(cookie, /Max-Age=28800/i);
  assert.doesNotMatch(cookie, /Secure/i);
});

test("admin login rejects an incorrect password", async () => {
  const response = await loginWithCredentials(
    ADMIN_USERNAME,
    "Wrong-Password-2026"
  );

  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.status, "error");
  assert.equal(
    body.message,
    "Invalid administrator credentials."
  );
});

test("admin session endpoint returns authenticated user", async () => {
  const response = await authenticatedRequest("/me");

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "authenticated");
  assert.equal(body.username, ADMIN_USERNAME);
  assert.ok(body.expiresAt);
});

test("admin cannot access applications without a session", async () => {
  const response = await request("/applications");

  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.status, "error");
});

test("admin can retrieve paginated applications", async () => {
  const response = await authenticatedRequest(
    "/applications?page=1&limit=2"
  );

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "success");

  assert.equal(body.applications.length, 2);

  assert.equal(
    body.applications[0].applicationId,
    "AG-003"
  );

  assert.equal(
    body.applications[1].applicationId,
    "AG-002"
  );

  assert.deepEqual(body.pagination, {
    page: 1,
    limit: 2,
    total: 3,
    totalPages: 2,
  });

  for (const application of body.applications) {
    assert.equal("_id" in application, false);
  }
});

test("admin application pagination returns the next page", async () => {
  const response = await authenticatedRequest(
    "/applications?page=2&limit=2"
  );

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.applications.length, 1);

  assert.equal(
    body.applications[0].applicationId,
    "AG-001"
  );

  assert.equal(body.pagination.page, 2);
  assert.equal(body.pagination.totalPages, 2);
});

test("admin application endpoint rejects invalid pagination", async () => {
  const invalidQueries = [
    "?page=0",
    "?page=-1",
    "?page=1000001",
    "?page=abc",
    "?limit=0",
    "?limit=101",
    "?limit=abc",
  ];

  for (const query of invalidQueries) {
    const response = await authenticatedRequest(
      `/applications${query}`
    );

    const body = await response.json();

    assert.equal(response.status, 400, query);
    assert.equal(body.status, "error", query);
  }
});

test("admin logout revokes the active session", async () => {
  const response = await authenticatedRequest("/logout", {
    method: "POST",
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "logged_out");

  const clearedCookie = response.headers.get("set-cookie");

  assert.match(clearedCookie, /Max-Age=0/i);

  const sessionResponse = await authenticatedRequest("/me");

  assert.equal(sessionResponse.status, 401);
});
