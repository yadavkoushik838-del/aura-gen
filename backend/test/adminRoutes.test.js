
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

const PORT = 4102;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const ALLOWED_ORIGIN = "http://localhost:3000";

let server;

before(async () => {
  server = spawn("node", ["src/server.js"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORT),
    },
    stdio: "inherit",
  });

  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) {
      throw new Error(
        "Admin test server exited before becoming ready."
      );
    }

    try {
      const response = await fetch(`${BASE_URL}/health`);

      if (response.ok) {
        return;
      }
    } catch {
      // Server may still be starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Admin test server did not become ready.");
});

after(() => {
  if (server && server.exitCode === null) {
    server.kill();
  }
});

test("admin routes reject requests without an Origin header", async () => {
  const response = await fetch(
    `${BASE_URL}/api/admin/me`
  );

  assert.equal(response.status, 403);
});

test("admin routes reject untrusted origins", async () => {
  const response = await fetch(
    `${BASE_URL}/api/admin/me`,
    {
      headers: {
        Origin: "https://untrusted.example",
      },
    }
  );

  assert.equal(response.status, 403);
});

test("admin session endpoint rejects unauthenticated requests", async () => {
  const response = await fetch(
    `${BASE_URL}/api/admin/me`,
    {
      headers: {
        Origin: ALLOWED_ORIGIN,
      },
    }
  );

  assert.equal(response.status, 401);
});

test("application records are protected from unauthenticated access", async () => {
  const response = await fetch(
    `${BASE_URL}/api/admin/applications`,
    {
      headers: {
        Origin: ALLOWED_ORIGIN,
      },
    }
  );

  assert.equal(response.status, 401);
});
