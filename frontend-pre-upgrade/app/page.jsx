
"use client";

import { useEffect, useRef, useState } from "react";
import { createAuraSocket } from "../lib/socket";
import { useTelemetry } from "../hooks/useTelemetry";
import FinancialForm from "../components/FinancialForm";
import AdaptiveWizard from "../components/AdaptiveWizard";
import MetricCard from "../components/MetricCard";

const initialValues = {
  fullName: "",
  email: "",
  employment: "",
  annualIncome: "",
};

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
  const [uiConfig, setUiConfig] = useState(null);

  const [notice, setNotice] = useState(
    "Complete the form normally, or use the test button to demonstrate adaptation."
  );

  const [aiSource, setAiSource] = useState(
    "Waiting for first adaptation"
  );

  const [submission, setSubmission] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [sessionStats, setSessionStats] = useState(initialSessionStats);

  // Manual adaptation protection
  const [manualRequestPending, setManualRequestPending] = useState(false);
  const [manualCooldown, setManualCooldown] = useState(0);

  // Ref prevents multiple clicks before React updates the state.
  const manualRequestLock = useRef(false);
  const manualRequestTimeout = useRef(null);

  // Session analytics
  const [scoreHistory, setScoreHistory] = useState([
    { score: 0, time: getTime() },
  ]);

  const [adaptationHistory, setAdaptationHistory] = useState([]);

  const [sessionTimeline, setSessionTimeline] = useState([
    {
      id: 1,
      event: "AuraGen session initialized",
      detail: "Waiting for user interactions.",
      time: getTime(),
      type: "system",
    },
  ]);

  const [totalScoreUpdates, setTotalScoreUpdates] = useState(0);

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

  // Manual cooldown countdown
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

      addTimelineEvent(
        "Backend disconnected",
        "Connection to the backend was interrupted.",
        "warning"
      );
    });

    client.on("connection-status", (data) => {
      setNotice(data.message);
    });

    // Receive cognitive analysis from backend.
    client.on("load-score", (data) => {
      const nextScore = data.score ?? 0;

      setScore(nextScore);

      // Preserve default metrics if an older backend omits a field.
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

    // Receive and count valid adaptive UI configurations.
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

        // Release manual request lock when the response arrives.
        if (adaptationType === "manual") {
          finishManualRequest();
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
      client.disconnect();
    };
  }, []);

  useTelemetry({ socket, enabled: true });

  function updateField(name, value) {
    setValues((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function reportValidationError(count) {
    socket?.emit("telemetry", {
      validationErrors: count,
      completedFieldCount: Object.values(values).filter(
        (value) => String(value).trim()
      ).length,
    });

    addTimelineEvent(
      "Form validation issue",
      `${count} required field(s) need attention.`,
      "warning"
    );

    setNotice(`${count} required field(s) need attention.`);
  }

  // Protected manual adaptation request.
  function simulateConfusion() {
    if (!socket?.connected) {
      setNotice("Backend is disconnected. Please wait for reconnection.");
      return;
    }

    // Prevent rapid duplicate clicks.
    if (manualRequestLock.current || manualCooldown > 0) {
      return;
    }

    manualRequestLock.current = true;
    setManualRequestPending(true);
    setManualCooldown(5);

    addTimelineEvent(
      "Manual adaptation requested",
      "User triggered the simulation control.",
      "manual"
    );

    setNotice("Manual adaptation requested. Waiting for the AI response...");

    socket.emit("request-adaptation", {
      completedFieldCount: Object.values(values).filter(
        (value) => String(value).trim()
      ).length,
    });

    // Safety release if no response arrives.
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

  async function submitApplication() {
    if (submitting) return;

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
      setSubmitting(false);
    }
  }

  function startNewApplication() {
    setSubmission(null);
    setUiConfig(null);
    setValues(initialValues);
    setNotice("A new demo application is ready.");

    addTimelineEvent(
      "New application started",
      "The application form was reset.",
      "system"
    );
  }

  function resetDemo() {
    finishManualRequest();

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
        : "Simulate confusion";

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
        >
          Reset demo
        </button>
      </div>

      <div className="notice" role="status">
        {notice}
      </div>

      {submission ? (
        <section
          className="form-card"
          role="status"
          aria-live="polite"
        >
          <div className="form-card-heading">
            <div>
              <span className="eyebrow">
                AURAGEN · SUBMISSION COMPLETE
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
            Demo privacy note: this prototype validates the details
            and returns a receipt, but does not save applicant
            information to a database.
          </p>

          <button
            className="button button-primary"
            onClick={startNewApplication}
          >
            Start a new application
          </button>
        </section>
      ) : uiConfig ? (
        <AdaptiveWizard
          config={uiConfig}
          values={values}
          onChange={updateField}
          onSubmit={submitApplication}
          submitting={submitting}
          onExit={() => {
            setUiConfig(null);
            setNotice(
              "Returned to the full form. Your data is still available."
            );
          }}
        />
      ) : (
        <section className="form-card">
          <div className="form-card-heading">
            <div>
              <span className="eyebrow">
                STEP 01 · APPLICATION
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
          />

          <div className="test-panel">
            <div>
              <strong>Developer demo control</strong>

              <p>
                Trigger a simulated high-friction event to test the
                adaptive interface.
              </p>
            </div>

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
          </div>

          {manualRequestPending && (
            <p className="muted" role="status">
              Please wait while AuraGen generates your adaptive interface.
            </p>
          )}

          {!manualRequestPending && manualCooldown > 0 && (
            <p className="muted" role="status">
              You can trigger another manual adaptation in {manualCooldown} seconds.
            </p>
          )}
        </section>
      )}

      <footer>
        AURAGEN · ADAPTIVE UX PLATFORM
        <span>
          Friction score is heuristic · Demo submissions are not stored
        </span>
      </footer>
    </main>
  );
}
