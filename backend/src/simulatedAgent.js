// Simulates an AI agent. Later, replace this function with a LangChain call.
// It returns a declarative JSON configuration, never executable source code.
export function generateAdaptiveUI(metrics, formData = {}) {
  let reason = "Several interaction difficulties were detected.";
  if (metrics.validationErrors > 0) {
    reason = "Some fields appear difficult to complete or validate.";
  } else if (metrics.rageClicks > 0 || metrics.repeatedClicks > 0) {
    reason = "Repeated clicks suggest that the current form may be difficult to navigate.";
  } else if (metrics.hesitations > 0) {
    reason = "Long pauses suggest that the form may need clearer guidance.";
  }

  const steps = [
    {
      id: "personal",
      title: "Personal details",
      description: "Let's start with the basic details.",
      fields: [
        { name: "fullName", label: "Full name", type: "text", placeholder: "Enter your full name" },
        { name: "email", label: "Email address", type: "email", placeholder: "name@example.com" },
      ],
    },
    {
      id: "employment",
      title: "Employment details",
      description: "Next, tell us about your work.",
      fields: [
        { name: "employment", label: "Employment status", type: "select", options: ["Employed", "Self-employed", "Student", "Other"] },
        { name: "annualIncome", label: "Annual income (₹)", type: "number", placeholder: "e.g. 600000" },
      ],
    },
    {
      id: "review",
      title: "Review your details",
      description: "Check the information you entered before submitting.",
      fields: [],
    },
  ];

  return {
    version: 1,
    mode: "wizard",
    title: "Let's make this easier",
    explanation: reason,
    steps,
    preservedFieldCount: Number(formData.completedFieldCount) || 0,
  };
}
