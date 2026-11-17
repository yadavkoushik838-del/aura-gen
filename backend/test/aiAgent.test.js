
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  generateAdaptiveUIWithAI,
  buildAdaptivePrompt,
} from "../src/aiAgent.js";

import { clearGenerationCache } from "../src/aiGenerationCache.js";

// Clear the cache before every test to prevent test interference.
beforeEach(() => {
  clearGenerationCache();
});

const originalProvider = process.env.AI_PROVIDER;
const originalFetch = globalThis.fetch;

function restoreEnvironment() {
  if (originalProvider === undefined) {
    delete process.env.AI_PROVIDER;
  } else {
    process.env.AI_PROVIDER = originalProvider;
  }

  globalThis.fetch = originalFetch;
}

function createValidAIResponse() {
  return {
    title: "Complete your application",
    explanation: "Follow these simple steps.",
    steps: [
      {
        id: "personal",
        title: "Your details",
        description: "Enter your personal information.",
        fields: [
          { name: "fullName", label: "Your full name" },
          { name: "email", label: "Your email address" },
        ],
      },
      {
        id: "employment",
        title: "Your employment",
        description: "Tell us about your work.",
        fields: [
          { name: "employment", label: "Work status" },
          { name: "annualIncome", label: "Yearly income" },
        ],
      },
      {
        id: "review",
        title: "Review",
        description: "Check your details.",
        fields: [],
      },
    ],
  };
}

test("simulated provider returns the approved wizard structure", async () => {
  process.env.AI_PROVIDER = "simulated";

  try {
    const result = await generateAdaptiveUIWithAI(
      {
        hesitations: 0,
        rageClicks: 0,
        validationErrors: 0,
        repeatedClicks: 0,
      },
      { completedFieldCount: 2 }
    );

    assert.equal(result.mode, "wizard");
    assert.equal(result.steps.length, 3);
    assert.equal(result.preservedFieldCount, 2);
    assert.equal(result.generatedBy, "simulated");
  } finally {
    restoreEnvironment();
  }
});

test("AI prompt contains strict generation rules", () => {
  const prompt = buildAdaptivePrompt({
    hesitations: 2,
    rageClicks: 1,
    validationErrors: 3,
    repeatedClicks: 4,
  });

  assert.match(prompt, /Return only valid JSON/);
  assert.match(prompt, /Do not generate JavaScript, JSX, HTML/);
  assert.match(prompt, /Do not add, remove, rename, or reorder/);
  assert.match(prompt, /personal/);
  assert.match(prompt, /employment/);
  assert.match(prompt, /review/);
});

test("Ollama response preserves the approved wizard structure", async () => {
  process.env.AI_PROVIDER = "ollama";

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      response: JSON.stringify(createValidAIResponse()),
    }),
  });

  try {
    const result = await generateAdaptiveUIWithAI(
      {
        hesitations: 2,
        rageClicks: 1,
        validationErrors: 0,
        repeatedClicks: 1,
      },
      { completedFieldCount: 2 }
    );

    assert.equal(result.generatedBy, "ollama");
    assert.equal(result.steps.length, 3);

    assert.deepEqual(
      result.steps.map((step) => step.id),
      ["personal", "employment", "review"]
    );

    assert.equal(result.steps[0].fields[0].name, "fullName");
    assert.equal(result.steps[0].fields[0].type, "text");
    assert.equal(result.steps[1].fields[0].type, "select");
    assert.equal(result.preservedFieldCount, 2);
  } finally {
    restoreEnvironment();
  }
});

test("AI cannot change approved fields or field types", async () => {
  process.env.AI_PROVIDER = "ollama";

  const maliciousResponse = createValidAIResponse();

  maliciousResponse.steps[0].fields[0] = {
    name: "fullName",
    label: "Modified field",
    type: "password",
  };

  maliciousResponse.steps[0].fields.push({
    name: "unexpectedField",
    label: "Unexpected field",
    type: "text",
  });

  maliciousResponse.steps.reverse();

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      response: JSON.stringify(maliciousResponse),
    }),
  });

  try {
    const result = await generateAdaptiveUIWithAI(
      { hesitations: 1 },
      {}
    );

    assert.deepEqual(
      result.steps.map((step) => step.id),
      ["personal", "employment", "review"]
    );

    assert.equal(result.steps[0].fields.length, 2);
    assert.equal(result.steps[0].fields[0].type, "text");
    assert.equal(result.steps[0].fields[0].label, "Full name");

    assert.equal(
      result.steps[0].fields.some(
        (field) => field.name === "unexpectedField"
      ),
      false
    );
  } finally {
    restoreEnvironment();
  }
});

test("invalid Ollama JSON activates the safe fallback", async () => {
  process.env.AI_PROVIDER = "ollama";

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      response: "This is not valid JSON",
    }),
  });

  try {
    const result = await generateAdaptiveUIWithAI(
      { hesitations: 2 },
      { completedFieldCount: 1 }
    );

    assert.equal(result.generatedBy, "simulated-fallback");
    assert.equal(result.mode, "wizard");
    assert.equal(result.steps.length, 3);
    assert.equal(result.preservedFieldCount, 1);
  } finally {
    restoreEnvironment();
  }
});

test("AI prompt includes sanitized UI context without personal values", () => {
  const prompt = buildAdaptivePrompt(
    { hesitations: 2 },
    {
      currentStep: "employment",
      completedFieldCount: 2,
      validationErrorCount: 1,
      fields: [
        {
          name: "fullName",
          type: "text",
          completed: true,
          validationState: "valid",
          value: "Private Test User",
        },
      ],
    }
  );

  assert.match(prompt, /"currentStep":"employment"/);
  assert.match(prompt, /"completedFieldCount":2/);
  assert.match(prompt, /"validationErrorCount":1/);
  assert.match(prompt, /"name":"fullName"/);

  assert.equal(prompt.includes("Private Test User"), false);
});

test("Ollama receives sanitized UI context instead of personal values", async () => {
  process.env.AI_PROVIDER = "ollama";

  let capturedRequest;

  globalThis.fetch = async (_url, options) => {
    capturedRequest = JSON.parse(options.body);

    return {
      ok: true,
      json: async () => ({
        response: JSON.stringify(createValidAIResponse()),
      }),
    };
  };

  try {
    const result = await generateAdaptiveUIWithAI(
      { hesitations: 2 },
      {
        uiContext: {
          currentStep: "employment",
          completedFieldCount: 2,
          validationErrorCount: 1,
          fields: [
            {
              name: "email",
              type: "email",
              completed: true,
              validationState: "valid",
              value: "private@example.com",
            },
          ],
        },
      }
    );

    assert.ok(capturedRequest);

    assert.match(
      capturedRequest.prompt,
      /"currentStep":"employment"/
    );

    assert.match(
      capturedRequest.prompt,
      /"completedFieldCount":2/
    );

    assert.equal(
      capturedRequest.prompt.includes("private@example.com"),
      false
    );

    assert.equal(result.generatedBy, "ollama");
    assert.equal(result.preservedFieldCount, 2);
  } finally {
    restoreEnvironment();
  }
});

test("AI response with missing steps preserves the complete wizard", async () => {
  process.env.AI_PROVIDER = "ollama";

  const incompleteResponse = createValidAIResponse();
  incompleteResponse.steps = [
    incompleteResponse.steps[0],
  ];

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      response: JSON.stringify(incompleteResponse),
    }),
  });

  try {
    const result = await generateAdaptiveUIWithAI(
      { hesitations: 1 },
      { completedFieldCount: 2 }
    );

    assert.deepEqual(
      result.steps.map((step) => step.id),
      ["personal", "employment", "review"]
    );

    assert.equal(result.steps[1].fields.length, 2);
    assert.equal(result.steps[2].fields.length, 0);
    assert.equal(result.generatedBy, "ollama");
  } finally {
    restoreEnvironment();
  }
});

test("AI response with duplicate steps cannot duplicate wizard steps", async () => {
  process.env.AI_PROVIDER = "ollama";

  const duplicateResponse = createValidAIResponse();
  duplicateResponse.steps.push({
    ...duplicateResponse.steps[0],
    title: "Duplicate personal step",
  });

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      response: JSON.stringify(duplicateResponse),
    }),
  });

  try {
    const result = await generateAdaptiveUIWithAI({}, {});

    assert.equal(result.steps.length, 3);

    assert.deepEqual(
      result.steps.map((step) => step.id),
      ["personal", "employment", "review"]
    );
  } finally {
    restoreEnvironment();
  }
});

test("AI response with invalid labels uses approved fallback labels", async () => {
  process.env.AI_PROVIDER = "ollama";

  const invalidResponse = createValidAIResponse();
  invalidResponse.steps[0].fields[0].label = {
    unexpected: "object",
  };
  invalidResponse.steps[0].fields[1].label = "";

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      response: JSON.stringify(invalidResponse),
    }),
  });

  try {
    const result = await generateAdaptiveUIWithAI({}, {});

    assert.equal(result.steps[0].fields[0].label, "Full name");
    assert.equal(result.steps[0].fields[1].label, "Email address");
    assert.equal(result.generatedBy, "ollama");
  } finally {
    restoreEnvironment();
  }
});

test("AI-generated text is cleaned and length-limited", async () => {
  process.env.AI_PROVIDER = "ollama";

  const longResponse = createValidAIResponse();
  longResponse.title = "<b>" + "A".repeat(100);
  longResponse.explanation = "B".repeat(250);
  longResponse.steps[0].fields[0].label = "C".repeat(100);

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      response: JSON.stringify(longResponse),
    }),
  });

  try {
    const result = await generateAdaptiveUIWithAI({}, {});

    assert.equal(result.title.length, 70);
    assert.equal(result.title.includes("<"), false);
    assert.equal(result.title.includes(">"), false);
    assert.equal(result.explanation.length, 180);
    assert.equal(result.steps[0].fields[0].label.length, 50);
  } finally {
    restoreEnvironment();
  }
});

test("Ollama HTTP errors activate the safe fallback", async () => {
  process.env.AI_PROVIDER = "ollama";

  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
  });

  try {
    const result = await generateAdaptiveUIWithAI(
      { hesitations: 2 },
      { completedFieldCount: 1 }
    );

    assert.equal(result.generatedBy, "simulated-fallback");
    assert.equal(result.mode, "wizard");
    assert.equal(result.steps.length, 3);
    assert.equal(result.preservedFieldCount, 1);
  } finally {
    restoreEnvironment();
  }
});

test("AI response with malformed root data activates the safe fallback", async () => {
  process.env.AI_PROVIDER = "ollama";

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      response: JSON.stringify(null),
    }),
  });

  try {
    const result = await generateAdaptiveUIWithAI(
      {},
      { completedFieldCount: 2 }
    );

    assert.equal(result.generatedBy, "simulated-fallback");
    assert.equal(result.mode, "wizard");
    assert.equal(result.steps.length, 3);
    assert.equal(result.preservedFieldCount, 2);
  } finally {
    restoreEnvironment();
  }
});

test("generation audit: 25 repeated AI generations preserve the approved wizard structure", async () => {
  process.env.AI_PROVIDER = "ollama";

  let generationCount = 0;

  globalThis.fetch = async () => {
    generationCount += 1;

    const response = createValidAIResponse();

    // Alternate the model's step order to test structural consistency.
    if (generationCount % 2 === 0) {
      response.steps.reverse();
    }

    return {
      ok: true,
      json: async () => ({
        response: JSON.stringify(response),
      }),
    };
  };

  try {
    for (let index = 0; index < 25; index += 1) {
      // Force a fresh AI generation on every audit iteration.
      clearGenerationCache();

      const result = await generateAdaptiveUIWithAI(
        { hesitations: index % 4 },
        { completedFieldCount: 2 }
      );

      assert.equal(result.generatedBy, "ollama");
      assert.equal(result.mode, "wizard");
      assert.equal(result.steps.length, 3);

      assert.deepEqual(
        result.steps.map((step) => step.id),
        ["personal", "employment", "review"]
      );

      assert.deepEqual(
        result.steps[0].fields.map((field) => ({
          name: field.name,
          type: field.type,
        })),
        [
          { name: "fullName", type: "text" },
          { name: "email", type: "email" },
        ]
      );

      assert.deepEqual(
        result.steps[1].fields.map((field) => ({
          name: field.name,
          type: field.type,
        })),
        [
          { name: "employment", type: "select" },
          { name: "annualIncome", type: "number" },
        ]
      );

      assert.deepEqual(
        result.steps[1].fields[0].options,
        ["Employed", "Self-employed", "Student", "Other"]
      );

      assert.equal(result.steps[2].fields.length, 0);
      assert.equal(result.preservedFieldCount, 2);
    }

    assert.equal(generationCount, 25);
  } finally {
    restoreEnvironment();
  }
});

test("generation cache reuses an identical successful Ollama response", async () => {
  process.env.AI_PROVIDER = "ollama";

  let generationCount = 0;

  globalThis.fetch = async () => {
    generationCount += 1;

    return {
      ok: true,
      json: async () => ({
        response: JSON.stringify(createValidAIResponse()),
      }),
    };
  };

  try {
    const metrics = {
      hesitations: 2,
      rageClicks: 1,
      validationErrors: 0,
      repeatedClicks: 1,
    };

    const uiContext = {
      completedFieldCount: 2,
    };

    // First request: should call Ollama.
    const firstResult = await generateAdaptiveUIWithAI(
      metrics,
      uiContext
    );

    // Second identical request: should use the cache.
    const secondResult = await generateAdaptiveUIWithAI(
      metrics,
      uiContext
    );

    assert.equal(firstResult.generatedBy, "ollama");
    assert.equal(secondResult.generatedBy, "ollama");

    // Ollama should have been called only once.
    assert.equal(generationCount, 1);

    assert.deepEqual(secondResult, firstResult);
  } finally {
    restoreEnvironment();
  }
});
