
import { createHash } from "node:crypto";

import { validateGeneratedCode } from "./security/generatedCodeValidator.js";

import {
  getCachedGeneration,
  cacheSuccessfulGeneration,
} from "./aiGenerationCache.js";

const OLLAMA_URL =
  process.env.OLLAMA_URL ||
  "http://127.0.0.1:11434/api/generate";

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL ||
  "llama3.2:3b";

const MAX_SOURCE_LENGTH = 20_000;

const GENERATION_TIMEOUT_MS =
  Number(process.env.GENERATED_CODE_TIMEOUT_MS) || 30_000;

const GENERATION_PROMPT_VERSION = "preview-v1";

const GENERATION_PROMPT = `
Generate one complete React JSX component for AuraGen.

Requirements:
1. Return source code only. Do not use Markdown fences or explanations.
2. Export exactly one default React function component named Preview.
3. Import React only from "react", if an import is needed.
4. Use only these HTML elements:
   div, span, p, h1, h2, h3, h4, section, article,
   header, footer, strong, em, small, ul, ol, li,
   button, label, input, img, hr, br.
5. Do not use event handlers or interactive JavaScript.
6. Do not use browser APIs, external libraries, network requests,
   timers, dynamic imports, or external resources.
7. Do not use JSX spread attributes, refs, or dangerouslySetInnerHTML.
8. Use simple, readable JSX and static content.
9. Keep the complete source under 20,000 characters.

Expected structure:
export default function Preview() {
  return (
    <div>
      <h2>Generated interface</h2>
      <p>Example content</p>
    </div>
  );
}

Generate a polished, responsive-looking interface using the
permitted elements and simple inline styles.
`;

function createGenerationCacheKey() {
  const keyData = JSON.stringify({
    namespace: "auragen-generated-component",
    version: GENERATION_PROMPT_VERSION,
    model: OLLAMA_MODEL,
    endpoint: OLLAMA_URL,
    prompt: GENERATION_PROMPT,
  });

  const hash = createHash("sha256")
    .update(keyData)
    .digest("hex");

  return `generated-code:${hash}`;
}

function createPerformanceMetrics(finalData) {
  return {
    totalDurationMs: Number.isFinite(finalData.total_duration)
      ? Math.round(finalData.total_duration / 1e6)
      : null,

    loadDurationMs: Number.isFinite(finalData.load_duration)
      ? Math.round(finalData.load_duration / 1e6)
      : null,

    promptEvalDurationMs: Number.isFinite(
      finalData.prompt_eval_duration
    )
      ? Math.round(finalData.prompt_eval_duration / 1e6)
      : null,

    generationDurationMs: Number.isFinite(finalData.eval_duration)
      ? Math.round(finalData.eval_duration / 1e6)
      : null,

    promptTokens: Number.isFinite(
      finalData.prompt_eval_count
    )
      ? finalData.prompt_eval_count
      : null,

    generatedTokens: Number.isFinite(finalData.eval_count)
      ? finalData.eval_count
      : null,

    tokensPerSecond:
      Number.isFinite(finalData.eval_count) &&
      Number.isFinite(finalData.eval_duration) &&
      finalData.eval_duration > 0
        ? Number(
            (
              finalData.eval_count /
              (finalData.eval_duration / 1e9)
            ).toFixed(2)
          )
        : null,
  };
}

export async function* generateCodeStream({ signal } = {}) {
  const cacheKey = createGenerationCacheKey();

  // Reuse a previously validated component when available.
  const cachedResult = getCachedGeneration(cacheKey);

  if (
    cachedResult &&
    cachedResult.generatedBy === "ollama" &&
    typeof cachedResult.source === "string"
  ) {
    const cachedValidation = validateGeneratedCode(
      cachedResult.source
    );

    if (
      cachedValidation.valid &&
      cachedResult.source.trim().length > 0
    ) {
      yield {
        type: "token",
        token: cachedResult.source,
      };

      yield {
        type: "complete",
        valid: true,
        issues: [],
        sourceLength: cachedResult.source.length,
        performance: null,
        cacheHit: true,
      };

      return;
    }
  }

  const timeoutSignal = AbortSignal.timeout(
    GENERATION_TIMEOUT_MS
  );

  const requestSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: GENERATION_PROMPT,
      stream: true,
      keep_alive: "10m",
      options: {
        temperature: 0.2,
        num_predict: 800,
      },
    }),
    signal: requestSignal,
  });

  if (!response.ok) {
    throw new Error(
      `Ollama returned HTTP ${response.status}.`
    );
  }

  if (!response.body) {
    throw new Error("Ollama returned an empty response stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let source = "";
  let generationFinished = false;
  let finalData = null;

  function processLine(line) {
    if (!line.trim()) {
      return null;
    }

    let data;

    try {
      data = JSON.parse(line);
    } catch {
      throw new Error("Ollama returned an invalid stream response.");
    }

    if (data.error) {
      throw new Error("Ollama reported a generation error.");
    }

    if (data.done === true) {
      generationFinished = true;
      finalData = data;
    }

    if (
      typeof data.response === "string" &&
      data.response.length > 0
    ) {
      source += data.response;

      if (source.length > MAX_SOURCE_LENGTH) {
        throw new Error(
          "Generated source exceeds 20,000 characters."
        );
      }

      return {
        type: "token",
        token: data.response,
      };
    }

    return null;
  }

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, {
        stream: true,
      });

      let newlineIndex;

      while (
        (newlineIndex = buffer.indexOf("\n")) !== -1
      ) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        const tokenEvent = processLine(line);

        if (tokenEvent) {
          yield tokenEvent;
        }
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      const tokenEvent = processLine(buffer);

      if (tokenEvent) {
        yield tokenEvent;
      }
    }

    if (!generationFinished || !finalData) {
      throw new Error(
        "Ollama stream ended before generation completed."
      );
    }

    if (!source.trim()) {
      throw new Error("Ollama generated empty source code.");
    }

    const validation = validateGeneratedCode(source);

    const performance = createPerformanceMetrics(finalData);

    // Cache only successful, validated Ollama-generated components.
    if (validation.valid) {
      cacheSuccessfulGeneration(cacheKey, {
        generatedBy: "ollama",
        source,
        performance,
      });
    }

    yield {
      type: "complete",
      valid: validation.valid,
      issues: validation.issues,
      sourceLength: source.length,
      performance,
      cacheHit: false,
    };
  } finally {
    reader.releaseLock();
  }
}
