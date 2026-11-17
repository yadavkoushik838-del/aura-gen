
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function runWithEnvironment(overrides) {
  return spawnSync("node", ["src/server.js"], {
    env: {
      ...process.env,
      ...overrides,
    },
    encoding: "utf8",
    timeout: 5000,
  });
}

test("rejects an invalid server port", () => {
  const result = runWithEnvironment({
    PORT: "70000",
  });

  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 1);
  assert.ok(
    output.includes(
      "PORT must be an integer between 1 and 65535."
    )
  );
});

test("rejects an unsupported AI provider", () => {
  const result = runWithEnvironment({
    PORT: "4000",
    AI_PROVIDER: "invalid-provider",
  });

  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 1);
  assert.ok(
    output.includes(
      "AI_PROVIDER must be ollama or simulated."
    )
  );
});

test("rejects insecure HTTP origins in production", () => {
  const result = runWithEnvironment({
    NODE_ENV: "production",
    PORT: "4000",
    AI_PROVIDER: "simulated",
    CLIENT_ORIGIN: "http://localhost:3000",
  });

  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 1);
  assert.ok(output.includes("CLIENT_ORIGIN"));
});
