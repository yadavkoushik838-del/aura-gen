
const ALLOWED_FIELDS = [
  "fullName",
  "email",
  "employment",
  "annualIncome",
];

const ALLOWED_STEPS = [
  "personal",
  "employment",
  "review",
];

const ALLOWED_FIELD_TYPES = [
  "text",
  "email",
  "number",
  "select",
];

const ALLOWED_VALIDATION_STATES = [
  "valid",
  "invalid",
  "not-checked",
];

const MAX_FIELD_COUNT = 4;
const MAX_ERROR_COUNT = 4;

function safeInteger(value, maximum) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(0, Math.min(maximum, Math.floor(number)));
}

// Accept UI metadata only. Never accept or return actual form values.
export function sanitizeUIContext(input = {}) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    input = {};
  }

  const fields = Array.isArray(input.fields)
    ? input.fields
    : [];

  const safeFields = fields
    .filter(
      (field) =>
        field &&
        typeof field === "object" &&
        !Array.isArray(field) &&
        ALLOWED_FIELDS.includes(field.name) &&
        ALLOWED_FIELD_TYPES.includes(field.type)
    )
    .slice(0, MAX_FIELD_COUNT)
    .map((field) => ({
      name: field.name,
      type: field.type,
      completed: field.completed === true,
      validationState: ALLOWED_VALIDATION_STATES.includes(
        field.validationState
      )
        ? field.validationState
        : "not-checked",
    }));

  const currentStep = ALLOWED_STEPS.includes(input.currentStep)
    ? input.currentStep
    : "personal";

  const completedFieldCount = safeInteger(
    input.completedFieldCount,
    MAX_FIELD_COUNT
  );

  return {
    currentStep,
    completedFieldCount,
    validationErrorCount: safeInteger(
      input.validationErrorCount,
      MAX_ERROR_COUNT
    ),
    fields: safeFields,
  };
}
