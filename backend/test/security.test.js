
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { io as createSocket } from "socket.io-client";

const PORT = 4101;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let server;

// ==========================================
// TEST SERVER SETUP
// ==========================================

before(async () => {
  server = spawn("node", ["src/server.js"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORT),
    },
    stdio: "ignore",
  });

  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) {
      throw new Error(
        "Test server exited before becoming ready."
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

  throw new Error("Test server did not become ready.");
});

// ==========================================
// TEST SERVER CLEANUP
// ==========================================

after(() => {
  if (server && server.exitCode === null) {
    server.kill();
  }
});

// ==========================================
// SECURITY HEADERS
// ==========================================

test("security headers are returned by the backend", async () => {
  const response = await fetch(`${BASE_URL}/health`);

  assert.equal(response.status, 200);

  assert.ok(
    response.headers.get("content-security-policy")
  );

  assert.equal(
    response.headers.get("x-content-type-options"),
    "nosniff"
  );

  assert.equal(
    response.headers.get("x-frame-options"),
    "SAMEORIGIN"
  );
});

// ==========================================
// REQUEST ID TRACKING
// ==========================================

test("each request receives a unique request ID", async () => {
  const firstResponse = await fetch(`${BASE_URL}/health`);
  const secondResponse = await fetch(`${BASE_URL}/health`);

  const firstRequestId =
    firstResponse.headers.get("x-request-id");

  const secondRequestId =
    secondResponse.headers.get("x-request-id");

  assert.ok(firstRequestId);
  assert.ok(secondRequestId);

  assert.match(
    firstRequestId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );

  assert.notEqual(
    firstRequestId,
    secondRequestId
  );
});

// ==========================================
// APPLICATION RATE LIMITING
// ==========================================

test("application endpoint enforces its rate limit", async () => {
  let lastResponse;

  for (let i = 0; i < 31; i++) {
    lastResponse = await fetch(
      `${BASE_URL}/api/applications`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{}",
      }
    );
  }

  assert.equal(lastResponse.status, 429);
});

// ==========================================
// NOT FOUND ERROR HANDLING
// ==========================================

test("unknown routes return a JSON 404 response", async () => {
  const response = await fetch(
    `${BASE_URL}/unknown-route`
  );

  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.status, "error");

  assert.equal(
    body.code,
    "RESOURCE_NOT_FOUND"
  );

  assert.ok(
    body.message.includes("Route not found")
  );
});

// ==========================================
// MALFORMED JSON ERROR HANDLING
// ==========================================

test("malformed JSON returns a JSON 400 response", async () => {
  const response = await fetch(
    `${BASE_URL}/api/applications`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{invalid-json",
    }
  );

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "error");

  assert.equal(
    body.code,
    "REQUEST_FAILED"
  );

  assert.ok(body.message);
});

// ==========================================
// ERROR RESPONSE FORMAT
// ==========================================

test("unknown API routes return JSON content type", async () => {
  const response = await fetch(
    `${BASE_URL}/api/unknown-endpoint`
  );

  const body = await response.json();

  assert.equal(response.status, 404);

  assert.equal(
    body.code,
    "RESOURCE_NOT_FOUND"
  );

  assert.match(
    response.headers.get("content-type") || "",
    /application\/json/
  );
});

// ==========================================
// GENERATED CODE VALIDATION API
// ==========================================

test("generated code endpoint accepts valid JSX", async () => {
  const response = await fetch(
    `${BASE_URL}/api/generated-code/validate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source:
          "export default function Preview(){ return <div>Hello</div>; }",
      }),
    }
  );

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "valid");
  assert.equal(body.valid, true);
  assert.deepEqual(body.issues, []);
  assert.ok(body.requestId);
});

test("generated code endpoint rejects prohibited eval calls", async () => {
  const response = await fetch(
    `${BASE_URL}/api/generated-code/validate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source:
          'export default function Preview(){ eval("alert(1)"); return <div>Hello</div>; }',
      }),
    }
  );

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "invalid");
  assert.equal(body.valid, false);

  assert.ok(
    body.issues.some((issue) => issue.includes("eval"))
  );

  assert.ok(body.requestId);
});

test("generated code endpoint rejects missing source", async () => {
  const response = await fetch(
    `${BASE_URL}/api/generated-code/validate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }
  );

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "invalid");
  assert.equal(body.valid, false);

  assert.ok(body.issues.length > 0);
});

// ==========================================
// GENERATED CODE RATE LIMITING
// ==========================================

test("generated code validation endpoint enforces its rate limit", async () => {
  let lastResponse;

  for (let i = 0; i < 21; i++) {
    lastResponse = await fetch(
      `${BASE_URL}/api/generated-code/validate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source:
            "export default function Preview(){ return <div>Hello</div>; }",
        }),
      }
    );
  }

  assert.equal(lastResponse.status, 429);
});

// ==========================================
// READINESS CHECK
// ==========================================

test("readiness endpoint returns 503 when the database is unavailable", async () => {
  const response = await fetch(`${BASE_URL}/ready`);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.status, "not_ready");
  assert.equal(body.dependencies.database.status, "unavailable");
  assert.ok(Number.isFinite(Date.parse(body.timestamp)));
});

// ==========================================
// SOCKET.IO TEST HELPER
// ==========================================

function connectTestSocket({
  origin,
  transport = "websocket",
} = {}) {
  return new Promise((resolve) => {
    const options = {
      transports: [transport],
      reconnection: false,
      timeout: 3000,
    };

    if (origin) {
      options.extraHeaders = {
        Origin: origin,
      };
    }

    const socket = createSocket(BASE_URL, options);

    socket.once("connect", () => {
      socket.close();
      resolve({ connected: true });
    });

    socket.once("connect_error", (error) => {
      socket.close();
      resolve({
        connected: false,
        error,
      });
    });
  });
}

// ==========================================
// SOCKET.IO ORIGIN SECURITY
// ==========================================

test("Socket.IO accepts an allowed localhost WebSocket origin", async () => {
  const result = await connectTestSocket({
    origin: "http://localhost:3000",
    transport: "websocket",
  });

  assert.equal(result.connected, true);
});

test("Socket.IO rejects a non-localhost unconfigured WebSocket origin", async () => {
  const result = await connectTestSocket({
    origin: "https://untrusted.example",
    transport: "websocket",
  });

  assert.equal(result.connected, false);
});

test("Socket.IO accepts connections without an Origin header", async () => {
  const result = await connectTestSocket({
    transport: "websocket",
  });

  assert.equal(result.connected, true);
});

test("Socket.IO accepts an allowed polling origin", async () => {
  const result = await connectTestSocket({
    origin: "http://localhost:3000",
    transport: "polling",
  });

  assert.equal(result.connected, true);
});

test("Socket.IO rejects a non-localhost unconfigured polling origin", async () => {
  const result = await connectTestSocket({
    origin: "https://untrusted.example",
    transport: "polling",
  });

  assert.equal(result.connected, false);
});
