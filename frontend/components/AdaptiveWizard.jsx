
"use client";

import { useEffect, useMemo, useState } from "react";

function SafeField({ field, value, onChange }) {
  const allowed = ["text", "email", "number", "select"];

  if (!field || !allowed.includes(field.type)) return null;

  const inputId = `adaptive-${field.name}`;
  const label = field.label || field.name;

  return (
    <label className="field" htmlFor={inputId}>
      <span>{label}</span>

      {field.type === "select" ? (
        <select
          id={inputId}
          name={field.name}
          value={value ?? ""}
          onChange={(event) =>
            onChange(field.name, event.target.value)
          }
        >
          <option value="">Choose an option</option>
          {(Array.isArray(field.options) ? field.options : [])
            .filter((item) => typeof item === "string")
            .map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
        </select>
      ) : (
        <input
          id={inputId}
          name={field.name}
          type={field.type}
          placeholder={field.placeholder || ""}
          value={value ?? ""}
          required={field.required !== false}
          onChange={(event) =>
            onChange(field.name, event.target.value)
          }
        />
      )}
    </label>
  );
}

export default function AdaptiveWizard({
  config,
  values,
  onChange,
  onExit,
  onSubmit,
  onStepChange,
  submitting = false,
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [validationMessage, setValidationMessage] = useState("");

  const steps = Array.isArray(config?.steps) ? config.steps : [];

  useEffect(() => {
    setStepIndex(0);
    setValidationMessage("");
  }, [config]);

  const safeStepIndex = Math.min(
    stepIndex,
    Math.max(steps.length - 1, 0)
  );

  const step = steps[safeStepIndex];

  const summary = useMemo(
    () =>
      Object.entries(values || {}).filter(([, value]) =>
        String(value ?? "").trim()
      ),
    [values]
  );

  useEffect(() => {
    if (step?.id && typeof onStepChange === "function") {
      onStepChange(step.id);
    }
  }, [step?.id, onStepChange]);

  function handleContinue() {
    if (!step || submitting) return;

    setValidationMessage("");

    const requiredFields = (step.fields || []).filter(
      (field) =>
        field &&
        field.required !== false &&
        typeof field.name === "string"
    );

    const missingFields = requiredFields.filter(
      (field) => !String(values?.[field.name] ?? "").trim()
    );

    if (missingFields.length > 0) {
      setValidationMessage(
        `Please complete: ${missingFields
          .map((field) => field.label || field.name)
          .join(", ")}`
      );
      return;
    }

    setStepIndex((current) => current + 1);
  }

  function handleBack() {
    setValidationMessage("");
    setStepIndex((current) => Math.max(0, current - 1));
  }

  if (!step || steps.length === 0) {
    return (
      <p className="muted" role="alert">
        The adaptive form configuration is unavailable. Return to
        the standard form and try again.
      </p>
    );
  }

  const progress = ((safeStepIndex + 1) / steps.length) * 100;
  const isLastStep = safeStepIndex === steps.length - 1;

  return (
    <section
      className="wizard-card"
      aria-label="AuraGen adaptive form"
    >
      <div className="wizard-topline">
        <div>
          <span className="eyebrow">AURAGEN ADAPTIVE MODE</span>
          <h2 className="wizard-title">
            {config.title || "Let's make this easier"}
          </h2>
        </div>

        <span className="step-count" aria-live="polite">
          STEP {safeStepIndex + 1} / {steps.length}
        </span>
      </div>

      <div
        className="progress-track"
        role="progressbar"
        aria-label="Form completion"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div
          className="progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      {config.explanation && (
        <p className="muted">{config.explanation}</p>
      )}

      <div className="wizard-step">
        {validationMessage && (
          <p className="validation-error" role="alert">
            {validationMessage}
          </p>
        )}

        <span className="eyebrow">
          STEP {String(safeStepIndex + 1).padStart(2, "0")}
        </span>

        <h3>{step.title || "Complete this step"}</h3>

        {step.description && (
          <p className="muted">{step.description}</p>
        )}

        {step.id === "review" ? (
          <div className="review-list">
            {summary.length > 0 ? (
              summary.map(([key, value]) => (
                <div className="review-row" key={key}>
                  <span>
                    {key
                      .replace(/[A-Z]/g, (match) => ` ${match}`)
                      .replace(/^./, (match) => match.toUpperCase())}
                  </span>
                  <strong>{String(value)}</strong>
                </div>
              ))
            ) : (
              <p className="muted">No details entered yet.</p>
            )}
          </div>
        ) : (
          <div className="form-grid">
            {(Array.isArray(step.fields) ? step.fields : []).map(
              (field, index) => (
                <SafeField
                  key={field?.name || index}
                  field={field}
                  value={values?.[field?.name]}
                  onChange={onChange}
                />
              )
            )}
          </div>
        )}
      </div>

      <div className="wizard-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={() =>
            safeStepIndex === 0 ? onExit() : handleBack()
          }
          disabled={submitting}
        >
          {safeStepIndex === 0 ? "Return to full form" : "Back"}
        </button>

        {isLastStep ? (
          <button
            type="button"
            className="button button-primary"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Finish review"}
          </button>
        ) : (
          <button
            type="button"
            className="button button-primary"
            onClick={handleContinue}
            disabled={submitting}
          >
            Continue <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </section>
  );
}
