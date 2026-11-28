
import test from "node:test";
import assert from "node:assert/strict";
import { validateApplication } from "../src/application.js";

const validApplication = {
  fullName: "Test User",
  email: "test@example.com",
  employment: "Student",
  annualIncome: "600000",
};

test("accepts a complete valid demo application", () => {
  assert.deepEqual(
    validateApplication(validApplication),
    { valid: true }
  );
});

test("accepts valid input with surrounding whitespace", () => {
  const application = {
    ...validApplication,
    fullName: "  Test User  ",
    email: "  test@example.com  ",
    employment: " Student ",
  };

  assert.equal(validateApplication(application).valid, true);
});

test("rejects a missing or malformed email", () => {
  for (const email of ["", "not-an-email", "missing@domain", "bad email@test.com"]) {
    assert.equal(
      validateApplication({ ...validApplication, email }).valid,
      false
    );
  }
});

test("rejects an email longer than 254 characters", () => {
  const email = `${"a".repeat(250)}@test.com`;

  assert.equal(
    validateApplication({ ...validApplication, email }).valid,
    false
  );
});

test("rejects names that are too short or too long", () => {
  for (const fullName of ["A", "A".repeat(101)]) {
    assert.equal(
      validateApplication({ ...validApplication, fullName }).valid,
      false
    );
  }
});

test("rejects unsupported employment values", () => {
  assert.equal(
    validateApplication({
      ...validApplication,
      employment: "Unknown",
    }).valid,
    false
  );
});

test("rejects missing, negative, or malformed income", () => {
  for (const annualIncome of ["", "-100", "12.50", "abc"]) {
    assert.equal(
      validateApplication({
        ...validApplication,
        annualIncome,
      }).valid,
      false
    );
  }
});

test("accepts zero income", () => {
  assert.equal(
    validateApplication({
      ...validApplication,
      annualIncome: "0",
    }).valid,
    true
  );
});

test("rejects malformed request bodies", () => {
  for (const input of [null, undefined, [], "invalid", 123]) {
    assert.equal(validateApplication(input).valid, false);
  }
});
test("rejects non-primitive annual income values", () => {
  for (const annualIncome of [
    ["600000"],
    [],
    { value: "600000" },
    true,
    false,
  ]) {
    assert.equal(
      validateApplication({
        ...validApplication,
        annualIncome,
      }).valid,
      false
    );
  }
});