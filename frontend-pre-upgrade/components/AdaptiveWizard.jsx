"use client";

import { useEffect, useMemo, useState } from "react";

function SafeField({ field, value, onChange }) {
  const allowed = ["text", "email", "number", "select"];
  if (!allowed.includes(field.type)) return null;
  return (
    <label className="field" key={field.name}>
      <span>{field.label}</span>
      {field.type === "select" ? (
        <select value={value || ""} onChange={(e) => onChange(field.name, e.target.value)}>
          <option value="">Choose an option</option>
          {(field.options || []).filter((item) => typeof item === "string").map((item) => <option key={item}>{item}</option>)}
        </select>
      ) : (
        <input type={field.type} placeholder={field.placeholder || ""} value={value || ""}
          onChange={(e) => onChange(field.name, e.target.value)} />
      )}
    </label>
  );
}

export default function AdaptiveWizard({ config, values, onChange, onExit, onSubmit, submitting = false }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [validationMessage, setValidationMessage] = useState("");
  useEffect(() => {
  setStepIndex(0);
}, [config]);
  const steps = Array.isArray(config?.steps) ? config.steps : [];
  const step = steps[stepIndex];
  const summary = useMemo(() => Object.entries(values).filter(([, value]) => String(value || "").trim()), [values]);
  function handleContinue() {
  setValidationMessage("");

  const requiredFields = (step.fields || []).filter(
    (field) => field.required !== false
  );

  const missingFields = requiredFields.filter(
    (field) => !String(values[field.name] || "").trim()
  );

  if (missingFields.length > 0) {
    setValidationMessage(
      `Please complete: ${missingFields.map((field) => field.label).join(", ")}`
    );
    return;
  }

  setStepIndex((current) => current + 1);
}
  if (!step) return <p className="muted">The adaptive form configuration is unavailable. Return to the standard form and try again.</p>;

  return (
    <section className="wizard-card">
      <div className="wizard-topline">
        <div><span className="eyebrow">AURAGEN ADAPTIVE MODE</span><h2 className="wizard-title">{config.title || "Let's make this easier"}</h2></div>
        <span className="step-count">STEP {stepIndex + 1} / {steps.length}</span>
      </div>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} /></div>
      <p className="muted">{config.explanation}</p>
      <div className="wizard-step">
        {validationMessage && (
  <p className="validation-error" role="alert">
    {validationMessage}
  </p>
)}
        <span className="eyebrow">STEP {String(stepIndex + 1).padStart(2, "0")}</span>
        <h3>{step.title}</h3><p className="muted">{step.description}</p>
        {step.id === "review" ? (
          <div className="review-list">
            {summary.length ? summary.map(([key, value]) => (
              <div className="review-row" key={key}><span>{key.replace(/[A-Z]/g, (m) => ` ${m}`).replace(/^./, (m) => m.toUpperCase())}</span><strong>{value}</strong></div>
            )) : <p className="muted">No details entered yet.</p>}
          </div>
        ) : <div className="form-grid">{(step.fields || []).map((field) =>
          <SafeField key={field.name} field={field} value={values[field.name]} onChange={onChange} />)}</div>}
      </div>
      <div className="wizard-actions">
        <button className="button button-secondary" onClick={() => stepIndex === 0 ? onExit() : setStepIndex((n) => n - 1)}>
          {stepIndex === 0 ? "Return to full form" : "Back"}
        </button>
        {stepIndex < steps.length - 1
          ? <button className="button button-primary" onClick={handleContinue}>Continue <span aria-hidden="true">→</span></button>
          : <button className="button button-primary" onClick={onSubmit} disabled={submitting}>{submitting ? "Submitting…" : "Finish review"}</button>}
      </div>
    </section>
  );
}
