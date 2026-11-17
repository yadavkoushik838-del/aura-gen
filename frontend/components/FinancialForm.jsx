
"use client";

import { useEffect, useState } from "react";

const fields = [
  {
    name: "fullName",
    label: "Full name",
    type: "text",
    placeholder: "Enter your full name",
    autoComplete: "name",
  },
  {
    name: "email",
    label: "Email address",
    type: "email",
    placeholder: "name@example.com",
    autoComplete: "email",
  },
  {
    name: "employment",
    label: "Employment status",
    type: "select",
    options: ["Employed", "Self-employed", "Student", "Other"],
  },
  {
    name: "annualIncome",
    label: "Annual income",
    type: "number",
    placeholder: "e.g. 600000",
  },
];

export default function FinancialForm({
  values,
  onChange,
  onValidationError,
  onSubmit,
  onStepChange,
  submitting = false,
}) {
  const [step, setStep] = useState("details");

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  function validateAndContinue(event) {
    event.preventDefault();

    const missing = fields.filter(
      (field) => !String(values[field.name] || "").trim()
    );

    if (missing.length > 0) {
      onValidationError(missing.length);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      onValidationError(1);
      return;
    }

    if (Number(values.annualIncome) < 0) {
      onValidationError(1);
      return;
    }

    setStep("review");
  }

  if (step === "review") {
    return (
      <section className="form-card">
        <div className="form-card-heading">
          <div>
            <span className="eyebrow">STEP 02 · REVIEW</span>
            <h3>Review your application</h3>
            <p className="muted">
              Check your information before submitting.
            </p>
          </div>
          <span className="form-tag">Review</span>
        </div>

        <div className="review-list">
          {fields.map((field) => (
            <div className="review-row" key={field.name}>
              <span>{field.label}</span>
              <strong>{values[field.name]}</strong>
            </div>
          ))}
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setStep("details")}
            disabled={submitting}
          >
            Back to details
          </button>

          <button
            type="button"
            className="button button-primary"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? "Submitting…" : "Submit application →"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={validateAndContinue} className="form-grid" noValidate>
      {fields.map((field) => (
        <label className="field" key={field.name}>
          <span>{field.label}</span>

          {field.type === "select" ? (
            <select
              required
              value={values[field.name] || ""}
              onChange={(event) =>
                onChange(field.name, event.target.value)
              }
            >
              <option value="">Select an option</option>
              {field.options.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          ) : (
            <input
              type={field.type}
              required
              min={field.type === "number" ? "0" : undefined}
              autoComplete={field.autoComplete}
              placeholder={field.placeholder}
              value={values[field.name] || ""}
              onChange={(event) =>
                onChange(field.name, event.target.value)
              }
            />
          )}
        </label>
      ))}

      <div className="form-actions">
        <button className="button button-primary" type="submit">
          Continue →
        </button>
      </div>
    </form>
  );
}
