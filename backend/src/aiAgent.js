
import { generateAdaptiveUI } from "./simulatedAgent.js";
import { sanitizeUIContext } from "./security/uiContext.js";
import {
  getCachedGeneration,
  cacheSuccessfulGeneration,
} from "./aiGenerationCache.js";

const OLLAMA_URL =
  process.env.OLLAMA_URL ||
  "http://127.0.0.1:11434/api/generate";

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";

const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 12000);

const ALLOWED_METRICS = [
  "hesitations",
  "rageClicks",
  "validationErrors",
  "repeatedClicks",
];

const ALLOWED_FIELDS = [
  "fullName",
  "email",
  "employment",
  "annualIncome",
];

const ALLOWED_OPTIONS = [
  "Employed",
  "Self-employed",
  "Student",
  "Other",
];

// Accept only known, bounded interaction metrics.
function sanitizeMetrics(metrics = {}) {
  const safeMetrics = {};

  for (const key of ALLOWED_METRICS) {
    const value = Number(metrics?.[key]);

    safeMetrics[key] = Number.isFinite(value)
      ? Math.max(0, Math.min(100, Math.floor(value)))
      : 0;
  }

  return safeMetrics;
}

// Accept only UI metadata. Never pass actual form values to the AI.
function getSafeUIContext(formData = {}) {
  const input =
    formData &&
    typeof formData === "object" &&
    !Array.isArray(formData)
      ? formData.uiContext ?? formData
      : {};

  return sanitizeUIContext(input);
}

// Keep generated wording short and remove HTML-like characters.
function cleanText(value, fallback, maxLength) {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned
    ? cleaned.slice(0, maxLength)
    : fallback;
}

// Build a predictable prompt using interaction metrics and safe UI metadata.
// The model may improve wording, but it cannot create executable code.
export function buildAdaptivePrompt(metrics = {}, uiContext = {}) {
  const safeMetrics = sanitizeMetrics(metrics);
  const safeContext = sanitizeUIContext(uiContext);

  return [
    "You are AuraGen, an AI assistant that improves the wording of a web application form.",
    "",
    "TASK:",
    "Generate a clearer and easier-to-understand version of the existing application wizard.",
    "",
    "STRICT OUTPUT RULES:",
    "1. Return only valid JSON.",
    "2. Do not return Markdown, explanations, or text outside the JSON.",
    "3. Do not generate JavaScript, JSX, HTML, CSS, or executable code.",
    "4. Do not add, remove, rename, or reorder any steps or fields.",
    "5. Do not change field names, field types, validation, or employment options.",
    "6. Do not include personal form values or invent applicant information.",
    "7. Use clear, simple, concise, professional language.",
    "8. Improve only the title, explanation, step titles, step descriptions, and field labels.",
    "9. Use UI context only to understand the user's current progress.",
    "10. Never attempt to reconstruct or request personal information.",
    "",
    "REQUIRED WIZARD STRUCTURE:",
    "The wizard must contain exactly these three steps in this order:",
    "1. personal",
    "2. employment",
    "3. review",
    "",
    "ALLOWED FIELD NAMES:",
    ALLOWED_FIELDS.join(", "),
    "",
    "ALLOWED EMPLOYMENT OPTIONS:",
    ALLOWED_OPTIONS.join(", "),
    "",
    "EXPECTED JSON SHAPE:",
    JSON.stringify({
      title: "A short application title",
      explanation: "A short explanation",
      steps: [
        {
          id: "personal",
          title: "Personal details",
          description: "Guidance for personal details",
          fields: [
            { name: "fullName", label: "Full name" },
            { name: "email", label: "Email address" },
          ],
        },
        {
          id: "employment",
          title: "Employment details",
          description: "Guidance for employment details",
          fields: [
            { name: "employment", label: "Employment status" },
            { name: "annualIncome", label: "Annual income" },
          ],
        },
        {
          id: "review",
          title: "Review your details",
          description: "Check your information before submitting",
          fields: [],
        },
      ],
    }),
    "",
    "INTERACTION METRICS:",
    JSON.stringify(safeMetrics),
    "",
    "SANITIZED UI CONTEXT:",
    JSON.stringify(safeContext),
    "",
    "CONTEXT USAGE:",
    "- Use currentStep to understand which wizard step the user is viewing.",
    "- Use completedFieldCount to understand progress.",
    "- Use validationErrorCount to identify where clearer guidance may help.",
    "- Use field completion and validation states to understand form progress.",
    "- Do not assume that an incomplete field is incorrect.",
    "- Do not change the wizard structure based on the context.",
    "",
    "Use the interaction metrics only to understand where clearer guidance may help.",
    "Never interpret these metrics as a medical or clinically validated cognitive-load measurement.",
  ].join("\n");
}

// Validate the model output against the original wizard structure.
// The model is allowed to change wording, not application functionality.
function safeConfig(candidate, metrics, uiContext = {}) {
  const safeMetrics = sanitizeMetrics(metrics);
  const safeContext = sanitizeUIContext(uiContext);

  const fallback = generateAdaptiveUI(safeMetrics, safeContext);

  if (!candidate || typeof candidate !== "object") {
    return {
      ...fallback,
      generatedBy: "simulated-fallback",
    };
  }

  const candidateSteps = Array.isArray(candidate.steps)
    ? candidate.steps
    : [];

  // Match steps by their fixed IDs, not by the model's array order.
  const safeSteps = fallback.steps.map((fallbackStep) => {
    const candidateStep = candidateSteps.find(
      (step) => step?.id === fallbackStep.id
    );

    if (!candidateStep || typeof candidateStep !== "object") {
      return fallbackStep;
    }

    const candidateFields = Array.isArray(candidateStep.fields)
      ? candidateStep.fields
      : [];

    return {
      ...fallbackStep,

      title: cleanText(
        candidateStep.title,
        fallbackStep.title,
        70
      ),

      description: cleanText(
        candidateStep.description,
        fallbackStep.description,
        180
      ),

      // Only accept labels for canonical fields.
      // The original field types and options always come from the fallback.
      fields: fallbackStep.fields.map((fallbackField) => {
               const candidateField = candidateFields.find(
            (field) =>
            field &&
            typeof field === "object" &&
            field.name === fallbackField.name &&
            ALLOWED_FIELDS.includes(field.name) &&
            (
              field.type === undefined ||
              field.type === fallbackField.type
            )
        );

        return {
          ...fallbackField,
          label: cleanText(
            candidateField?.label,
            fallbackField.label,
            50
          ),
        };
      }),
    };
  });

  return {
    version: 1,
    mode: "wizard",

    title: cleanText(
      candidate.title,
      fallback.title,
      70
    ),

    explanation: cleanText(
      candidate.explanation,
      fallback.explanation,
      180
    ),

    steps: safeSteps,

    preservedFieldCount: safeContext.completedFieldCount,

    generatedBy: "ollama",
  };
}

// Generate an adaptive UI using Ollama or the simulated fallback.
// Only sanitized UI metadata is passed into the AI prompt.
export async function generateAdaptiveUIWithAI(
  metrics = {},
  formData = {}
) {
  const safeMetrics = sanitizeMetrics(metrics);
  const safeContext = getSafeUIContext(formData);

  const provider = (
    process.env.AI_PROVIDER || "ollama"
  ).toLowerCase();

    if (provider !== "ollama") {
    return {
      ...generateAdaptiveUI(safeMetrics, safeContext),
      generatedBy: "simulated",
    };
  }

  // Build a cache key from sanitized inputs and model configuration.
  const cacheKey = JSON.stringify({
    model: OLLAMA_MODEL,
    endpoint: OLLAMA_URL,
    metrics: safeMetrics,
    uiContext: safeContext,
  });

  // Return a cached successful generation when available.
  const cachedResult = getCachedGeneration(cacheKey);

  if (cachedResult) {
    return cachedResult;
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    AI_TIMEOUT_MS
  );

  try {
    const prompt = buildAdaptivePrompt(
      safeMetrics,
      safeContext
    );

    const response = await fetch(OLLAMA_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        format: "json",
        options: {
          temperature: 0.2,
        },
      }),

      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Ollama returned HTTP ${response.status}`
      );
    }

    const body = await response.json();

    if (
      !body ||
      typeof body.response !== "string"
    ) {
      throw new Error("Ollama returned an invalid response.");
    }

    const parsed = JSON.parse(body.response);

       const result = safeConfig(
      parsed,
      safeMetrics,
      safeContext
    );

    cacheSuccessfulGeneration(cacheKey, result);

    return result;
  } catch (error) {
    console.warn(
      `Ollama unavailable; using safe simulated adaptation: ${error.message}`
    );

    return {
      ...generateAdaptiveUI(safeMetrics, safeContext),
      generatedBy: "simulated-fallback",
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Check whether the configured Ollama service is reachable.
export async function checkAIServiceHealth() {
  const provider = (
    process.env.AI_PROVIDER || "ollama"
  ).toLowerCase();

  if (provider !== "ollama") {
    return {
      status: "available",
      provider: "simulated",
      model: null,
    };
  }

  const tagsUrl = OLLAMA_URL.replace(
    /\/api\/generate\/?$/,
    "/api/tags"
  );

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    AI_TIMEOUT_MS
  );

  try {
    const response = await fetch(tagsUrl, {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Ollama returned HTTP ${response.status}`
      );
    }

    return {
      status: "available",
      provider: "ollama",
      model: OLLAMA_MODEL,
    };
  } catch (error) {
    return {
      status: "unavailable",
      provider: "ollama",
      model: OLLAMA_MODEL,
      message: error.name === "AbortError"
        ? "Ollama health check timed out."
        : "Ollama service is not reachable.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
