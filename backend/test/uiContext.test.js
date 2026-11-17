import { test } from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeUIContext,
} from "../src/security/uiContext.js";

// ==========================================
// VALID UI CONTEXT
// ==========================================

test("accepts valid UI context metadata", () => {
  const result = sanitizeUIContext({
    currentStep: "employment",
    completedFieldCount: 2,
    validationErrorCount: 1,
    fields: [
      {
        name: "fullName",
        type: "text",
        completed: true,
        validationState: "valid",
      },
      {
        name: "email",
        type: "email",
        completed: false,
        validationState: "not-checked",
      },
    ],
  });

  assert.deepEqual(result, {
    currentStep: "employment",
    completedFieldCount: 2,
    validationErrorCount: 1,
    fields: [
      {
        name: "fullName",
        type: "text",
        completed: true,
        validationState: "valid",
      },
      {
        name: "email",
        type: "email",
        completed: false,
        validationState: "not-checked",
      },
    ],
  });
});

// ==========================================
// INVALID INPUT
// ==========================================

test("uses safe defaults for invalid input", () => {
  assert.deepEqual(sanitizeUIContext(null), {
    currentStep: "personal",
    completedFieldCount: 0,
    validationErrorCount: 0,
    fields: [],
  });
});

test("rejects arrays as context input", () => {
  const result = sanitizeUIContext([]);

  assert.equal(result.currentStep, "personal");
  assert.deepEqual(result.fields, []);
});

// ==========================================
// FIELD ALLOWLIST
// ==========================================

test("rejects unauthorized field names", () => {
  const result = sanitizeUIContext({
    fields: [
      {
        name: "password",
        type: "text",
        completed: true,
      },
    ],
  });

  assert.deepEqual(result.fields, []);
});

test("rejects unauthorized field types", () => {
  const result = sanitizeUIContext({
    fields: [
      {
        name: "email",
        type: "password",
        completed: true,
      },
    ],
  });

  assert.deepEqual(result.fields, []);
});

test("limits accepted fields to four", () => {
  const result = sanitizeUIContext({
    fields: [
      { name: "fullName", type: "text" },
      { name: "email", type: "email" },
      { name: "employment", type: "select" },
      { name: "annualIncome", type: "number" },
      { name: "password", type: "text" },
    ],
  });

  assert.equal(result.fields.length, 4);
});

// ==========================================
// STEP AND COUNT SANITIZATION
// ==========================================

test("replaces unauthorized current steps", () => {
  const result = sanitizeUIContext({
    currentStep: "admin",
  });

  assert.equal(result.currentStep, "personal");
});

test("clamps completed field count", () => {
  const result = sanitizeUIContext({
    completedFieldCount: 100,
  });

  assert.equal(result.completedFieldCount, 4);
});

test("clamps validation error count", () => {
  const result = sanitizeUIContext({
    validationErrorCount: 100,
  });

  assert.equal(result.validationErrorCount, 4);
});

test("rejects negative counts", () => {
  const result = sanitizeUIContext({
    completedFieldCount: -5,
    validationErrorCount: -2,
  });

  assert.equal(result.completedFieldCount, 0);
  assert.equal(result.validationErrorCount, 0);
});

// ==========================================
// PRIVACY PROTECTION
// ==========================================

test("does not return actual form values", () => {
  const result = sanitizeUIContext({
    fields: [
      {
        name: "fullName",
        type: "text",
        value: "Private User",
        completed: true,
      },
      {
        name: "email",
        type: "email",
        value: "private@example.com",
        completed: true,
      },
    ],
  });

  assert.equal(
    Object.hasOwn(result.fields[0], "value"),
    false
  );

  assert.equal(
    Object.hasOwn(result.fields[1], "value"),
    false
  );

  assert.equal(
    JSON.stringify(result).includes("Private User"),
    false
  );

  assert.equal(
    JSON.stringify(result).includes("private@example.com"),
    false
  );
});