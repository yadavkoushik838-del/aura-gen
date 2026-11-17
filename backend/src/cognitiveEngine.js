
const METRIC_LIMITS = {
  hesitations: { weight: 8, cap: 32 },
  rageClicks: { weight: 12, cap: 36 },
  validationErrors: { weight: 10, cap: 30 },
  repeatedClicks: { weight: 4, cap: 12 },
  pointerMovements: { weight: 2, cap: 10 },
};

const METRIC_KEYS = Object.keys(METRIC_LIMITS);

function sanitizeMetrics(metrics = {}) {
  const safeMetrics = {};

  for (const key of METRIC_KEYS) {
    const value = Number(metrics?.[key] ?? 0);

    safeMetrics[key] = Number.isFinite(value)
      ? Math.max(0, Math.min(100, Math.floor(value)))
      : 0;
  }

  return safeMetrics;
}

// Transparent heuristic estimate, not a clinical measurement.
export function calculateCognitiveLoad(metrics = {}) {
  const safeMetrics = sanitizeMetrics(metrics);

  const score = METRIC_KEYS.reduce((total, key) => {
    const { weight, cap } = METRIC_LIMITS[key];

    return total + Math.min(
      safeMetrics[key] * weight,
      cap
    );
  }, 0);

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function emptyMetrics() {
  return {
    hesitations: 0,
    rageClicks: 0,
    validationErrors: 0,
    repeatedClicks: 0,
    pointerMovements: 0,
  };
}

export function analyzeInteractionFriction(metrics = {}) {
  const safeMetrics = sanitizeMetrics(metrics);
  const score = calculateCognitiveLoad(safeMetrics);

  let severity = "Low";

  if (score >= 75) {
    severity = "Critical";
  } else if (score >= 50) {
    severity = "High";
  } else if (score >= 25) {
    severity = "Moderate";
  }

  const recommendations = [];

  if (safeMetrics.hesitations >= 2) {
    recommendations.push(
      "Improve instructions and make the next action clearer."
    );
  }

  if (safeMetrics.rageClicks >= 2) {
    recommendations.push(
      "Improve button responsiveness and provide immediate feedback."
    );
  }

  if (safeMetrics.validationErrors >= 2) {
    recommendations.push(
      "Simplify form validation and explain errors beside the relevant fields."
    );
  }

  if (safeMetrics.repeatedClicks >= 2) {
    recommendations.push(
      "Prevent duplicate actions and show loading or progress feedback."
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "Interaction is currently smooth. Continue monitoring user behavior."
    );
  }

  const totalEvents = METRIC_KEYS.reduce(
    (total, key) => total + safeMetrics[key],
    0
  );

  let evidenceLevel = "Limited";

  if (totalEvents >= 10) {
    evidenceLevel = "Moderate";
  }

  if (totalEvents >= 25) {
    evidenceLevel = "Substantial";
  }

  return {
    score,
    severity,
    evidenceLevel,
    metrics: safeMetrics,
    recommendations,
  };
}
