
import { test } from "node:test";
import assert from "node:assert/strict";

import { isOriginAllowed } from "../src/security/originPolicy.js";

const productionConfig = {
  nodeEnv: "production",
  configuredOrigins: ["https://auragen.example.com"],
};

const developmentConfig = {
  nodeEnv: "development",
  configuredOrigins: [],
};

test("allows an explicitly configured production origin", () => {
  assert.equal(
    isOriginAllowed("https://auragen.example.com", productionConfig),
    true
  );
});

test("rejects an unconfigured external production origin", () => {
  assert.equal(
    isOriginAllowed("https://attacker.example.com", productionConfig),
    false
  );
});

test("rejects unconfigured localhost in production", () => {
  assert.equal(
    isOriginAllowed("http://localhost:3000", productionConfig),
    false
  );
});

test("rejects a production origin with a different port", () => {
  assert.equal(
    isOriginAllowed("https://auragen.example.com:8443", productionConfig),
    false
  );
});

test("allows requests without an Origin header", () => {
  assert.equal(isOriginAllowed(undefined, productionConfig), true);
});

test("allows localhost on arbitrary ports in development", () => {
  assert.equal(
    isOriginAllowed("http://localhost:3005", developmentConfig),
    true
  );
});

test("allows 127.0.0.1 on arbitrary ports in development", () => {
  assert.equal(
    isOriginAllowed("http://127.0.0.1:4000", developmentConfig),
    true
  );
});

test("rejects external origins in development", () => {
  assert.equal(
    isOriginAllowed("https://attacker.example.com", developmentConfig),
    false
  );
});

test("allows explicitly configured external origins in development", () => {
  assert.equal(
    isOriginAllowed("https://trusted.example.com", {
      nodeEnv: "development",
      configuredOrigins: ["https://trusted.example.com"],
    }),
    true
  );
});
