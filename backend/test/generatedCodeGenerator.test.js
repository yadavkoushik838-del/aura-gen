
import test from "node:test";
import assert from "node:assert/strict";

import {
  generateCodeStream,
} from "../src/generatedCodeGenerator.js";

import {
  clearGenerationCache,
} from "../src/aiGenerationCache.js";

const originalFetch = globalThis.fetch;

function mockOllamaResponse(lines, status = 200, onFetch = () => {}) {
  const body = lines.join("\n") + "\n";

  globalThis.fetch = async () => {
    onFetch();

    return new Response(body, {
      status,
      headers: {
        "Content-Type": "application/x-ndjson",
      },
    });
  };
}

async function collectEvents() {
  const events = [];

  for await (const event of generateCodeStream()) {
    events.push(event);
  }

  return events;
}

test("streams JSX tokens and validates completed source", async () => {
  clearGenerationCache();

  const source =
    'export default function Preview() { return <div><p>Hello</p></div>; }';

  mockOllamaResponse([
    JSON.stringify({ response: source, done: false }),
    JSON.stringify({ response: "", done: true }),
  ]);

  try {
    const events = await collectEvents();

    assert.equal(events[0].type, "token");
    assert.equal(events[0].token, source);
    assert.equal(events[1].type, "complete");
    assert.equal(events[1].valid, true);
    assert.equal(events[1].sourceLength, source.length);
    assert.equal(events[1].cacheHit, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects generated source containing prohibited code", async () => {
  clearGenerationCache();

  const source =
    'export default function Preview() { return <div>{window.location}</div>; }';

  mockOllamaResponse([
    JSON.stringify({ response: source, done: false }),
    JSON.stringify({ response: "", done: true }),
  ]);

  try {
    const events = await collectEvents();
    const completion = events.at(-1);

    assert.equal(completion.type, "complete");
    assert.equal(completion.valid, false);
    assert.ok(completion.issues.length > 0);
    assert.equal(completion.cacheHit, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects generated output exceeding 20,000 characters", async () => {
  clearGenerationCache();

  mockOllamaResponse([
    JSON.stringify({
      response: "x".repeat(20_001),
      done: false,
    }),
  ]);

  try {
    await assert.rejects(
      async () => collectEvents(),
      /exceeds 20,000 characters/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("handles Ollama HTTP errors", async () => {
  clearGenerationCache();

  mockOllamaResponse([], 500);

  try {
    await assert.rejects(
      async () => collectEvents(),
      /Ollama returned HTTP 500/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects an incomplete Ollama stream", async () => {
  clearGenerationCache();

  mockOllamaResponse([
    JSON.stringify({
      response: "<div>Hello</div>",
      done: false,
    }),
  ]);

  try {
    await assert.rejects(
      async () => collectEvents(),
      /ended before generation completed/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reuses cached generated source without calling Ollama again", async () => {
  clearGenerationCache();

  const source =
    'export default function Preview() { return <div><p>Cached interface</p></div>; }';

  let fetchCalls = 0;

  mockOllamaResponse(
    [
      JSON.stringify({ response: source, done: false }),
      JSON.stringify({ response: "", done: true }),
    ],
    200,
    () => {
      fetchCalls += 1;
    }
  );

  try {
    const firstEvents = await collectEvents();

    assert.equal(fetchCalls, 1);
    assert.equal(firstEvents.at(-1).valid, true);
    assert.equal(firstEvents.at(-1).cacheHit, false);

    const secondEvents = await collectEvents();

    assert.equal(fetchCalls, 1);
    assert.equal(secondEvents[0].type, "token");
    assert.equal(secondEvents[0].token, source);
    assert.equal(secondEvents.at(-1).type, "complete");
    assert.equal(secondEvents.at(-1).valid, true);
    assert.equal(secondEvents.at(-1).cacheHit, true);
    assert.equal(secondEvents.at(-1).performance, null);
  } finally {
    globalThis.fetch = originalFetch;
    clearGenerationCache();
  }
});

test("does not cache invalid generated source", async () => {
  clearGenerationCache();

  const source =
    'export default function Preview() { return <div>{window.location}</div>; }';

  let fetchCalls = 0;

  mockOllamaResponse(
    [
      JSON.stringify({ response: source, done: false }),
      JSON.stringify({ response: "", done: true }),
    ],
    200,
    () => {
      fetchCalls += 1;
    }
  );

  try {
    const firstEvents = await collectEvents();

    assert.equal(firstEvents.at(-1).valid, false);
    assert.equal(firstEvents.at(-1).cacheHit, false);

    const secondEvents = await collectEvents();

    assert.equal(fetchCalls, 2);
    assert.equal(secondEvents.at(-1).valid, false);
    assert.equal(secondEvents.at(-1).cacheHit, false);
  } finally {
    globalThis.fetch = originalFetch;
    clearGenerationCache();
  }
});
