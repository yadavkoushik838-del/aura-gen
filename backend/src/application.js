
const allowedEmployment = new Set([
  "Employed",
  "Self-employed",
  "Student",
  "Other",
]);

export function validateApplication(input) {
  // Validate input structure.
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    return {
      valid: false,
      message: "Application details are required.",
    };
  }

  // Extract and normalize permitted fields.
  const fullName =
    typeof input.fullName === "string"
      ? input.fullName.trim()
      : "";

  const email =
    typeof input.email === "string"
      ? input.email.trim()
      : "";

  const employment =
    typeof input.employment === "string"
      ? input.employment.trim()
      : "";

  const annualIncome = String(
    input.annualIncome ?? ""
  ).trim();

  // Name validation.
  if (fullName.length < 2 || fullName.length > 100) {
    return {
      valid: false,
      message: "Enter a name between 2 and 100 characters.",
    };
  }

  // Email validation.
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (
    email.length > 254 ||
    !emailPattern.test(email)
  ) {
    return {
      valid: false,
      message: "Enter a valid email address.",
    };
  }

  // Employment validation.
  if (!allowedEmployment.has(employment)) {
    return {
      valid: false,
      message: "Choose a valid employment status.",
    };
  }

  // Annual income validation.
  if (
    !/^\d{1,12}$/.test(annualIncome) ||
    !Number.isSafeInteger(Number(annualIncome))
  ) {
    return {
      valid: false,
      message: "Enter a valid annual income.",
    };
  }

  return {
    valid: true,
  };
}
