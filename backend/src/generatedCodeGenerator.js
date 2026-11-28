
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
  Number(process.env.GENERATED_CODE_TIMEOUT_MS) || 90_000;

// Increment this version whenever the generation prompt changes.
const GENERATION_PROMPT_VERSION = "preview-v2";

const GENERATION_PROMPT = `
Generate one complete, polished React JSX component for AuraGen,
an adaptive financial application platform.

STRICT REQUIREMENTS:
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
8. Use inline styles for all styling.
9. Keep the complete source under 20,000 characters.
10. Ensure all JSX tags and attributes are correctly formatted.

DESIGN:
Create a professional, modern financial application form.

Visual style:
- Clean white background.
- Dark navy headings.
- Blue accent colors.
- Rounded cards and input fields.
- Subtle shadows.
- Generous spacing.
- Consistent typography.
- Clear visual hierarchy.
- Responsive-looking layout.

COMPONENT STRUCTURE:

1. HEADER
- AuraGen branding.
- Small description: Adaptive UX Platform.

2. MAIN SECTION
- Heading: Financial Application.
- Description: Complete your application in a few simple steps.
- Progress indicator showing Step 1 of 3.

3. PERSONAL INFORMATION CARD
Include clearly labeled fields:
- Full Name.
- Email Address.
- Phone Number.
- Employment Status.
- Annual Income.

Use appropriate input types and helpful placeholder text.

4. PRIVACY INFORMATION
Display a short reassurance message explaining that applicant
information is handled securely.

5. PRIMARY ACTION
- Prominent blue Continue button.
- Clear visual hierarchy.
- Comfortable spacing around the button.

6. FOOTER
- AuraGen branding.
- Short application platform description.

QUALITY REQUIREMENTS:
- Every input must have a visible label.
- Group related fields into attractive cards.
- Use consistent spacing and typography.
- Make the primary action visually prominent.
- Avoid unnecessary decorative elements.
- Do not generate generic demo cards.
- Do not include "Example content".
- Do not include fake statistics or dashboard metrics.
- Generate a complete financial application interface.
- Use readable, maintainable JSX.

IMPORTANT:
The component is a static preview. Do not implement form
submission, event handlers, or interactive JavaScript.

EXPECTED EXPORT:

export default function Preview() {
  return (
    <div>
      {/* Complete financial application interface */}
    </div>
  );
}

Return only the complete React JSX source code.
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
        num_predict: 2000,
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
