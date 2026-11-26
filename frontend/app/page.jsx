
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createAuraSocket } from "../lib/socket";
import { useTelemetry } from "../hooks/useTelemetry";
import FinancialForm from "../components/FinancialForm";
import AdaptiveWizard from "../components/AdaptiveWizard";
import MetricCard from "../components/MetricCard";
import GeneratedCodePreview from "../components/GeneratedCodePreview";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const initialValues = {
  fullName: "",
  email: "",
  employment: "",
  annualIncome: "",
};

// Week 3: Only field metadata is shared with the backend.
const contextFields = [
  { name: "fullName", type: "text" },
  { name: "email", type: "email" },
  { name: "employment", type: "select" },
  { name: "annualIncome", type: "number" },
];

const initialMetrics = {
  hesitations: 0,
  rageClicks: 0,
  validationErrors: 0,
  repeatedClicks: 0,
  pointerMovements: 0,
};

const initialSessionStats = {
  totalAdaptations: 0,
  manualAdaptations: 0,
  automaticAdaptations: 0,
};

const initialRecommendations = [
  "Interaction is currently smooth. Continue monitoring user behavior.",
];

function getTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function Home() {
  const prefersReducedMotion = useReducedMotion();

  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [score, setScore] = useState(0);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [severity, setSeverity] = useState("Low");
  const [evidenceLevel, setEvidenceLevel] = useState("Limited");

  const [recommendations, setRecommendations] = useState(
    initialRecommendations
  );

  const [values, setValues] = useState(initialValues);
  const [activeStep, setActiveStep] = useState("personal");
  const [contextValidationErrors, setContextValidationErrors] =
    useState(0);

  const [uiConfig, setUiConfig] = useState(null);

  const [notice, setNotice] = useState(
    "Complete the form normally, or use the test buttons to demonstrate adaptation."
  );

  const [aiSource, setAiSource] = useState(
    "Waiting for first adaptation"
  );

  const [submission, setSubmission] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [sessionStats, setSessionStats] = useState(initialSessionStats);

  const [manualRequestPending, setManualRequestPending] = useState(false);
  const [manualCooldown, setManualCooldown] = useState(0);
  const [automaticTestPending, setAutomaticTestPending] = useState(false);

  const manualRequestLock = useRef(false);
  const submissionLock = useRef(false);
  const manualRequestTimeout = useRef(null);
  const automaticTestTimeout = useRef(null);

  const [scoreHistory, setScoreHistory] = useState([
    { score: 0, time: "--:--:--" },
  ]);

  const [adaptationHistory, setAdaptationHistory] = useState([]);

  const [sessionTimeline, setSessionTimeline] = useState([
    {
      id: 1,
      event: "AuraGen session initialized",
      detail: "Waiting for user interactions.",
      time: "--:--:--",
      type: "system",
    },
  ]);

  const [totalScoreUpdates, setTotalScoreUpdates] = useState(0);

  useEffect(() => {
    const currentTime = getTime();

    setScoreHistory((current) =>
      current.map((item) =>
        item.time === "--:--:--"
          ? { ...item, time: currentTime }
          : item
      )
    );

    setSessionTimeline((current) =>
      current.map((item) =>
        item.time === "--:--:--"
          ? { ...item, time: currentTime }
          : item
      )
    );
  }, []);

  function addTimelineEvent(event, detail, type = "system") {
    setSessionTimeline((current) =>
      [
        {
          id: `${Date.now()}-${Math.random()}`,
          event,
          detail,
          time: getTime(),
          type,
        },
        ...current,
      ].slice(0, 30)
    );
  }

  function finishManualRequest() {
    manualRequestLock.current = false;
    setManualRequestPending(false);

    if (manualRequestTimeout.current) {
      clearTimeout(manualRequestTimeout.current);
      manualRequestTimeout.current = null;
    }
  }

  useEffect(() => {
    if (manualCooldown <= 0) return;

    const timer = setTimeout(() => {
      setManualCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [manualCooldown]);

  useEffect(() => {
    const client = createAuraSocket();

    setSocket(client);

    client.on("connect", () => {
      setConnected(true);

      addTimelineEvent(
        "Backend connected",
        "AuraGen backend connection established.",
        "success"
      );
    });

    client.on("disconnect", () => {
      setConnected(false);
      finishManualRequest();
      setAutomaticTestPending(false);

      if (automaticTestTimeout.current) {
        clearTimeout(automaticTestTimeout.current);
        automaticTestTimeout.current = null;
      }

      addTimelineEvent(
        "Backend disconnected",
        "Connection to the backend was interrupted.",
        "warning"
      );
    });

    client.on("connection-status", (data) => {
      setNotice(data.message);
    });

    client.on("load-score", (data) => {
      const nextScore = data.score ?? 0;

      setScore(nextScore);

      setMetrics({
        ...initialMetrics,
        ...(data.metrics ?? {}),
      });

      setSeverity(data.severity ?? "Low");
      setEvidenceLevel(data.evidenceLevel ?? "Limited");

      setRecommendations(
        Array.isArray(data.recommendations)
          ? data.recommendations
          : ["Continue monitoring user interactions."]
      );

      setTotalScoreUpdates((current) => current + 1);

      setScoreHistory((current) =>
        [
          ...current,
          {
            score: nextScore,
            time: getTime(),
          },
        ].slice(-20)
      );
    });

    client.on("adapt-ui", (data) => {
      console.log(
        "FRONTEND RECEIVED ADAPT-UI:",
        data?.uiConfig?.generatedBy,
        data?.uiConfig?.title,
        data?.adaptationType
      );

      if (
        data?.uiConfig?.mode === "wizard" &&
        Array.isArray(data.uiConfig.steps)
      ) {
        const adaptationType =
          data.adaptationType === "automatic"
            ? "automatic"
            : data.adaptationType === "manual"
              ? "manual"
              : "unknown";

        if (adaptationType === "manual") {
          finishManualRequest();
        }

        if (adaptationType === "automatic") {
          setAutomaticTestPending(false);

          if (automaticTestTimeout.current) {
            clearTimeout(automaticTestTimeout.current);
            automaticTestTimeout.current = null;
          }
        }

        setSessionStats((current) => ({
          totalAdaptations: current.totalAdaptations + 1,

          manualAdaptations:
            current.manualAdaptations +
            (adaptationType === "manual" ? 1 : 0),

          automaticAdaptations:
            current.automaticAdaptations +
            (adaptationType === "automatic" ? 1 : 0),
        }));

        const historyEntry = {
          id: `${Date.now()}-${Math.random()}`,
          type: adaptationType,
          score: data.score ?? 0,
          title: data.uiConfig.title || "Adaptive interface generated",
          provider:
            data.uiConfig.generatedBy === "ollama"
              ? "Local Ollama"
              : "Safe fallback",
          time: getTime(),
        };

        setAdaptationHistory((current) =>
          [historyEntry, ...current].slice(0, 20)
        );

        addTimelineEvent(
          `${
            adaptationType === "manual"
              ? "Manual"
              : adaptationType === "automatic"
                ? "Automatic"
                : "Unknown"
          } adaptation generated`,
          `Adaptive interface received at friction score ${data.score ?? 0}.`,
          "adaptation"
        );

        setUiConfig(data.uiConfig);

        setAiSource(
          data.uiConfig.generatedBy === "ollama"
            ? "Generated by local Ollama"
            : "Safe fallback mode"
        );

        setNotice(
          "Adaptive interface generated. Your entered values have been preserved."
        );
      }
    });

    return () => {
      finishManualRequest();

      if (automaticTestTimeout.current) {
        clearTimeout(automaticTestTimeout.current);
        automaticTestTimeout.current = null;
      }

      client.disconnect();
    };
  }, []);

  useTelemetry({ socket, enabled: true });

  const handleStepChange = useCallback((step) => {
    const stepMapping = {
      details: "personal",
      personal: "personal",
      employment: "employment",
      review: "review",
    };

    setActiveStep(stepMapping[step] || "personal");
  }, []);

  useEffect(() => {
    if (!socket?.connected || !connected) {
      return;
    }

    const safeFields = contextFields.map((field) => ({
      name: field.name,
      type: field.type,
      completed: String(values[field.name] ?? "").trim().length > 0,
      validationState: "not-checked",
    }));

    const completedFieldCount = safeFields.filter(
      (field) => field.completed
    ).length;

    socket.emit("ui-context", {
      currentStep: activeStep,
      completedFieldCount,
      validationErrorCount: contextValidationErrors,
      fields: safeFields,
    });
  }, [
    socket,
    connected,
    values,
    activeStep,
    contextValidationErrors,
  ]);

  function updateField(name, value) {
    setValues((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function reportValidationError(count) {
    const safeErrorCount = Math.max(
      0,
      Math.min(4, Math.floor(Number(count) || 0))
    );

    setContextValidationErrors(safeErrorCount);

    socket?.emit("telemetry", {
      validationErrors: safeErrorCount,
      completedFieldCount: Object.values(values).filter(
        (value) => String(value ?? "").trim().length > 0
      ).length,
    });

    addTimelineEvent(
      "Form validation issue",
      `${count} required field(s) need attention.`,
      "warning"
    );

    setNotice(`${count} required field(s) need attention.`);
  }

  // Manual adaptation: preserves the original user-triggered workflow.
  function simulateConfusion() {
    if (!socket?.connected) {
      setNotice("Backend is disconnected. Please wait for reconnection.");
      return;
    }

    if (manualRequestLock.current || manualCooldown > 0) {
      return;
    }

    manualRequestLock.current = true;
    setManualRequestPending(true);
    setManualCooldown(5);

    addTimelineEvent(
      "Manual adaptation requested",
      "User triggered a manual adaptation request.",
      "manual"
    );

    setNotice("Manual adaptation requested. Waiting for the AI response...");

    socket.emit("request-adaptation", {
      completedFieldCount: Object.values(values).filter(
        (value) => String(value).trim()
      ).length,
    });

    manualRequestTimeout.current = setTimeout(() => {
      finishManualRequest();

      setNotice(
        "The adaptation request timed out. You can try again."
      );

      addTimelineEvent(
        "Manual adaptation timed out",
        "No adaptive interface response was received.",
        "warning"
      );
    }, 60000);
  }

  // Automatic adaptation test: sends synthetic signals through the
  // real telemetry pipeline. It does not request manual adaptation.
  function simulateHighFriction() {
    if (!socket?.connected) {
      setNotice("Backend is disconnected. Please wait for reconnection.");
      return;
    }

    if (automaticTestPending) {
      return;
    }

    setAutomaticTestPending(true);

    addTimelineEvent(
      "High-friction telemetry simulated",
      "Synthetic interaction signals sent through the real telemetry pipeline.",
      "warning"
    );

    setNotice(
      "High-friction telemetry sent. Waiting for automatic adaptation..."
    );

    socket.emit("telemetry", {
      hesitations: 2,
      rageClicks: 2,
      repeatedClicks: 2,
      validationErrors: 2,
      pointerMovements: 2,
    });

    automaticTestTimeout.current = setTimeout(() => {
      setAutomaticTestPending(false);
      automaticTestTimeout.current = null;

      setNotice(
        "Telemetry test completed. Check the friction score and automatic adaptation count."
      );

      addTimelineEvent(
        "Automatic adaptation test timed out",
        "No automatic adaptive interface was received. Check backend logs and threshold conditions.",
        "warning"
      );
    }, 30000);
  }

  async function submitApplication() {
    if (submissionLock.current || submitting) return;

    submissionLock.current = true;
    setSubmitting(true);
    setNotice("Submitting your application...");

    try {
      const response = await fetch(
        `${
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
        }/api/applications`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(values),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.message ||
            "The application could not be submitted. Please check your details."
        );
      }

      setSubmission(result);
      setNotice(result.message);

      addTimelineEvent(
        "Application submitted",
        `Confirmation ID: ${result.applicationId}`,
        "success"
      );
    } catch (error) {
      setNotice(
        error.message ||
          "Unable to reach the AuraGen backend. Please try again."
      );

      addTimelineEvent(
        "Application submission failed",
        error.message || "Backend request failed.",
        "warning"
      );
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  }

  function startNewApplication() {
    setSubmission(null);
    setUiConfig(null);
    setValues(initialValues);
    setActiveStep("personal");
    setContextValidationErrors(0);

    setNotice("A new demo application is ready.");

    addTimelineEvent(
      "New application started",
      "The application form was reset.",
      "system"
    );
  }

  function resetDemo() {
    finishManualRequest();

    if (automaticTestTimeout.current) {
      clearTimeout(automaticTestTimeout.current);
      automaticTestTimeout.current = null;
    }

    setAutomaticTestPending(false);
    setManualCooldown(0);
    setSubmission(null);
    setUiConfig(null);
    setAiSource("Waiting for first adaptation");

    setScore(0);
    setMetrics(initialMetrics);
    setSeverity("Low");
    setEvidenceLevel("Limited");
    setSessionStats(initialSessionStats);

    setRecommendations(initialRecommendations);
    setValues(initialValues);
    setActiveStep("personal");
    setContextValidationErrors(0);

    setScoreHistory([{ score: 0, time: getTime() }]);
    setAdaptationHistory([]);
    setTotalScoreUpdates(0);

    setSessionTimeline([
      {
        id: `${Date.now()}`,
        event: "Session reset",
        detail: "A new monitoring session has started.",
        time: getTime(),
        type: "system",
      },
    ]);

    socket?.emit("reset-session");

    setNotice("Demo reset. Start with the full financial form.");
  }

  const averageScore =
    scoreHistory.length > 0
      ? Math.round(
          scoreHistory.reduce((sum, item) => sum + item.score, 0) /
            scoreHistory.length
        )
      : 0;

  const peakScore =
    scoreHistory.length > 0
      ? Math.max(...scoreHistory.map((item) => item.score))
      : 0;

  const manualButtonDisabled =
    !connected || manualRequestPending || manualCooldown > 0;

  const manualButtonLabel = !connected
    ? "Backend disconnected"
    : manualRequestPending
      ? "Generating adaptation..."
      : manualCooldown > 0
        ? `Wait ${manualCooldown}s`
        : "Request manual adaptation";

  const automaticButtonDisabled =
    !connected || automaticTestPending;

  const automaticButtonLabel = !connected
    ? "Backend disconnected"
    : automaticTestPending
      ? "Testing automatic adaptation..."
      : "Test automatic adaptation";

  // Week 3: Shared transition settings for all interface states.
  const transitionDuration = prefersReducedMotion ? 0 : 0.28;

  const viewInitial = prefersReducedMotion
    ? { opacity: 1 }
    : { opacity: 0, y: 14 };

  const viewExit = prefersReducedMotion
    ? { opacity: 1 }
    : { opacity: 0, y: -10 };

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-mark">A</span> AuraGen
        </a>

        <div className="connection">
          <span
            className={
              connected ? "status-dot online" : "status-dot"
            }
          />
          {connected
            ? "Backend connected"
            : "Connecting to backend..."}
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">
            ADAPTIVE EXPERIENCE INTELLIGENCE
          </div>

          <h1>
            A clearer experience,
            <br />
            at every interaction.
          </h1>

          <p className="hero-copy">
            AuraGen observes interaction signals and simplifies a
            complex financial form into a guided, step-by-step
            experience.
          </p>
        </div>

        <div className="hero-orb">
          <span>AG</span>
          <small>ADAPTIVE UI</small>
        </div>
      </section>

      {/* Live interaction metrics */}
      <section className="dashboard-grid">
        <MetricCard
          label="Interaction friction"
          value={`${score}/100`}
          hint={
            score >= 60
              ? "Adaptation threshold reached"
              : "No high-friction signal"
          }
        />

        <MetricCard
          label="Hesitations"
          value={metrics.hesitations}
          hint="Long pauses before movement"
        />

        <MetricCard
          label="Repeated clicks"
          value={metrics.repeatedClicks + metrics.rageClicks}
          hint="Rapid or repeated interactions"
        />

        <MetricCard
          label="Validation errors"
          value={metrics.validationErrors}
          hint="Form completion difficulties"
        />

        <MetricCard
          label="Pointer movements"
          value={metrics.pointerMovements ?? 0}
          hint="Meaningful movement bursts detected"
        />
      </section>

      {/* Session analytics */}
      <section
        className="form-card"
        style={{ marginBottom: "24px" }}
      >
        <div className="form-card-heading">
          <div>
            <span className="eyebrow">SESSION ANALYTICS</span>
            <h3>Adaptation activity</h3>
            <p className="muted">
              Manual and automatic adaptive UI configurations
              received during this session.
            </p>
          </div>

          <span className="form-tag">Live session</span>
        </div>

        <div className="dashboard-grid">
          <MetricCard
            label="Total adaptations"
            value={sessionStats.totalAdaptations}
            hint="All valid configurations received"
          />

          <MetricCard
            label="Manual adaptations"
            value={sessionStats.manualAdaptations}
            hint="Triggered by user action"
          />

          <MetricCard
            label="Automatic adaptations"
            value={sessionStats.automaticAdaptations}
            hint="Triggered by friction threshold"
          />
        </div>
      </section>

      {/* Session summary */}
      <section
        className="form-card"
        style={{ marginBottom: "24px" }}
      >
        <div className="form-card-heading">
          <div>
            <span className="eyebrow">SESSION OVERVIEW</span>
            <h3>Performance summary</h3>
            <p className="muted">
              A snapshot of the current monitoring session.
            </p>
          </div>

          <span className="form-tag">Live metrics</span>
        </div>

        <div className="dashboard-grid">
          <MetricCard
            label="Average friction"
            value={`${averageScore}/100`}
            hint="Average of recent score updates"
          />

          <MetricCard
            label="Peak friction"
            value={`${peakScore}/100`}
            hint="Highest recorded session score"
          />

          <MetricCard
            label="Score updates"
            value={totalScoreUpdates}
            hint="Cognitive analysis updates received"
          />
        </div>
      </section>

      {/* Friction trend */}
      <section
        className="form-card"
        style={{ marginBottom: "24px" }}
      >
        <div className="form-card-heading">
          <div>
            <span className="eyebrow">INTERACTION TRENDS</span>
            <h3>Friction score history</h3>
            <p className="muted">
              The latest 20 friction score updates received by AuraGen.
            </p>
          </div>

          <span className="form-tag">
            {scoreHistory.length} points
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "end",
            gap: "8px",
            height: "150px",
            padding: "12px 4px 0",
            borderBottom: "1px solid var(--border, #ddd)",
          }}
          role="img"
          aria-label="Bar chart showing recent friction scores"
        >
          {scoreHistory.map((item, index) => (
            <div
              key={`${index}-${item.time}`}
              title={`${item.score}/100 at ${item.time}`}
              style={{
                flex: 1,
                minWidth: "5px",
                height: `${Math.max(item.score, 3)}%`,
                maxHeight: "100%",
                background:
                  item.score >= 60 ? "#d97757" : "#548b9b",
                borderRadius: "5px 5px 0 0",
                transition: "height 0.3s ease",
              }}
            />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "10px",
            fontSize: "12px",
            opacity: 0.7,
          }}
        >
          <span>Older updates</span>
          <span>Latest update</span>
        </div>

        <p className="muted" style={{ marginTop: "14px" }}>
          The chart represents received heuristic friction scores,
          not a clinical measurement.
        </p>
      </section>

      {/* Adaptation history */}
      <section
        className="form-card"
        style={{ marginBottom: "24px" }}
      >
        <div className="form-card-heading">
          <div>
            <span className="eyebrow">ADAPTATION HISTORY</span>
            <h3>Generated interface configurations</h3>
            <p className="muted">
              A record of valid adaptive interfaces received in this session.
            </p>
          </div>

          <span className="form-tag">
            {adaptationHistory.length} recorded
          </span>
        </div>

        {adaptationHistory.length === 0 ? (
          <p className="muted">
            No adaptive configurations have been received yet.
          </p>
        ) : (
          <div className="review-list">
            {adaptationHistory.map((item) => (
              <div className="review-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p className="muted">
                    {item.type} adaptation · {item.provider}
                  </p>
                </div>

                <div style={{ textAlign: "right" }}>
                  <strong>{item.score}/100</strong>
                  <p className="muted">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Session timeline */}
      <section
        className="form-card"
        style={{ marginBottom: "24px" }}
      >
        <div className="form-card-heading">
          <div>
            <span className="eyebrow">SESSION ACTIVITY</span>
            <h3>Event timeline</h3>
            <p className="muted">
              Important events recorded during the current session.
            </p>
          </div>

          <span className="form-tag">
            {sessionTimeline.length} events
          </span>
        </div>

        <div className="review-list">
          {sessionTimeline.map((item) => (
            <div className="review-row" key={item.id}>
              <div>
                <strong>{item.event}</strong>
                <p className="muted">{item.detail}</p>
              </div>

              <div style={{ textAlign: "right" }}>
                <span className="form-tag">{item.type}</span>
                <p className="muted">{item.time}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Cognitive analysis */}
      <section
        className="form-card"
        style={{ marginBottom: "24px" }}
      >
        <div className="form-card-heading">
          <div>
            <span className="eyebrow">
              COGNITIVE FRICTION INTELLIGENCE
            </span>

            <h3>Interaction analysis</h3>

            <p className="muted">
              Transparent heuristic analysis of current interaction
              patterns.
            </p>
          </div>

          <span className="form-tag">{severity} severity</span>
        </div>

        <div className="dashboard-grid">
          <MetricCard
            label="Friction severity"
            value={severity}
            hint="Based on the current friction score"
          />

          <MetricCard
            label="Evidence level"
            value={evidenceLevel}
            hint="Based on accumulated interaction events"
          />
        </div>

        <div style={{ marginTop: "24px" }}>
          <h3>Improvement recommendations</h3>

          <ul
            style={{
              paddingLeft: "22px",
              lineHeight: 1.9,
            }}
          >
            {recommendations.map((recommendation, index) => (
              <li key={`${index}-${recommendation}`}>
                {recommendation}
              </li>
            ))}
          </ul>
        </div>

        <p className="muted" style={{ marginTop: "16px" }}>
          Note: Friction scores and evidence levels are heuristic
          estimates, not clinically validated cognitive measurements.
        </p>
      </section>

      {/* Adaptation engine */}
      <section className="insight-strip">
        <div>
          <span className="insight-label">ADAPTATION ENGINE</span>

          <strong>
            {uiConfig
              ? "Adaptive mode active"
              : "Monitoring interactions"}
          </strong>

          <small>{aiSource}</small>
        </div>

        <div className="score-track">
          <div style={{ width: `${score}%` }} />
        </div>

        <span className="score-caption">
          {score} / 100 friction
        </span>
      </section>

      <div className="workspace-heading">
        <div>
          <div className="eyebrow">YOUR WORKSPACE</div>
          <h2>Financial application</h2>
        </div>

        <button
          className="button button-quiet"
          onClick={resetDemo}
          disabled={submitting}
          aria-label={submitting ? "Cannot reset while submitting an application" : "Reset demo"}
        >
          Reset demo
        </button>
      </div>

      <div className="notice" role="status">
        {notice}
      </div>

      {/* Week 3: Animated transitions between UI states. */}
      <AnimatePresence mode="wait" initial={false}>
        {submission ? (
          <motion.div
            key="submission"
            initial={viewInitial}
            animate={{ opacity: 1, y: 0 }}
            exit={viewExit}
            transition={{
              duration: transitionDuration,
              ease: "easeInOut",
            }}
          >
            <section
              className="form-card"
              role="status"
              aria-live="polite"
            >
              <div className="form-card-heading">
                <div>
                  <span className="eyebrow">
                    AURAGEN | SUBMISSION COMPLETE
                  </span>

                  <h3>Application submitted successfully</h3>

                  <p className="muted">
                    Your demo application passed validation and the
                    backend issued this confirmation receipt.
                  </p>
                </div>

                <span className="form-tag">Submitted</span>
              </div>

              <div className="review-list">
                <div className="review-row">
                  <span>Confirmation ID</span>
                  <strong>{submission.applicationId}</strong>
                </div>

                <div className="review-row">
                  <span>Submission time</span>
                  <strong>
                    {new Date(submission.submittedAt).toLocaleString()}
                  </strong>
                </div>

                <div className="review-row">
                  <span>Applicant</span>
                  <strong>{values.fullName}</strong>
                </div>
              </div>

              <p className="muted">
                Privacy note: Submitting this application stores your name,
                email, employment status, and annual income in MongoDB for
                application review. Use demo information rather than real
                personal or financial details.
              </p>

              <button
                className="button button-primary"
                onClick={startNewApplication}
              >
                Start a new application
              </button>
            </section>
          </motion.div>
        ) : uiConfig ? (
          <motion.div
            key="adaptive-wizard"
            initial={viewInitial}
            animate={{ opacity: 1, y: 0 }}
            exit={viewExit}
            transition={{
              duration: transitionDuration,
              ease: "easeInOut",
            }}
          >
            <AdaptiveWizard
              config={uiConfig}
              values={values}
              onChange={updateField}
              onSubmit={submitApplication}
              submitting={submitting}
              onStepChange={handleStepChange}
              onExit={() => {
                setUiConfig(null);
                setActiveStep("personal");
                setNotice(
                  "Returned to the full form. Your data is still available."
                );
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="standard-form"
            initial={viewInitial}
            animate={{ opacity: 1, y: 0 }}
            exit={viewExit}
            transition={{
              duration: transitionDuration,
              ease: "easeInOut",
            }}
          >
            <section className="form-card">
              <div className="form-card-heading">
                <div>
                  <span className="eyebrow">
                    STEP 01 | APPLICATION
                  </span>

                  <h3>Applicant information</h3>

                  <p className="muted">
                    Enter the details below to continue.
                  </p>
                </div>

                <span className="form-tag">
                  Standard interface
                </span>
              </div>

              <FinancialForm
                values={values}
                onChange={updateField}
                onValidationError={reportValidationError}
                onSubmit={submitApplication}
                submitting={submitting}
                onStepChange={handleStepChange}
              />

              <div
                className="test-panel"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <div>
                  <strong>Developer demo controls</strong>

                  <p>
                    Test manual adaptation or simulate high-friction
                    telemetry to verify automatic adaptation.
                  </p>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <button
                    className="button button-primary"
                    onClick={simulateConfusion}
                    disabled={manualButtonDisabled}
                    aria-busy={manualRequestPending}
                    style={{
                      opacity: manualButtonDisabled ? 0.6 : 1,
                      cursor: manualButtonDisabled
                        ? "not-allowed"
                        : "pointer",
                    }}
                  >
                    {manualButtonLabel}
                  </button>

                  <button
                    className="button button-primary"
                    onClick={simulateHighFriction}
                    disabled={automaticButtonDisabled}
                    aria-busy={automaticTestPending}
                    style={{
                      opacity: automaticButtonDisabled ? 0.6 : 1,
                      cursor: automaticButtonDisabled
                        ? "not-allowed"
                        : "pointer",
                    }}
                  >
                    {automaticButtonLabel}
                  </button>
                </div>
              </div>

              {manualRequestPending && (
                <p className="muted" role="status">
                  Please wait while AuraGen generates your manual adaptive interface.
                </p>
              )}

              {!manualRequestPending && manualCooldown > 0 && (
                <p className="muted" role="status">
                  You can request another manual adaptation in {manualCooldown} seconds.
                </p>
              )}

              {automaticTestPending && (
                <p className="muted" role="status">
                  Synthetic telemetry has been sent. Waiting for the backend
                  to generate an automatic adaptive interface.
                </p>
              )}
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      <GeneratedCodePreview />

      <footer>
        AURAGEN | ADAPTIVE UX PLATFORM
        <span>
          Friction score is heuristic | Submitted applications are stored in MongoDB
        </span>
      </footer>
    </main>
  );
}
