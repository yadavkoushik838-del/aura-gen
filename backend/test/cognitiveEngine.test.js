
import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateCognitiveLoad,
  emptyMetrics,
} from "../src/cognitiveEngine.js";

test("empty metrics produce zero friction", () => {
  assert.equal(calculateCognitiveLoad(emptyMetrics()), 0);
});

test("friction score applies documented weights", () => {
  assert.equal(
    calculateCognitiveLoad({
      hesitations: 1,
      rageClicks: 1,
      validationErrors: 1,
      repeatedClicks: 1,
    }),
    34
  );
});

test("pointer movements contribute to friction score", () => {
  assert.equal(
    calculateCognitiveLoad({
      pointerMovements: 3,
    }),
    6
  );
});

test("pointer movement contribution is capped", () => {
  assert.equal(
    calculateCognitiveLoad({
      pointerMovements: 100,
    }),
    10
  );
});

test("friction score is capped at 100", () => {
  assert.equal(
    calculateCognitiveLoad({
      hesitations: 100,
      rageClicks: 100,
      validationErrors: 100,
      repeatedClicks: 100,
      pointerMovements: 100,
    }),
    100
  );
});
