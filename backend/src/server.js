
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { randomUUID } from "node:crypto";
import pino from "pino";
import pinoHttp from "pino-http";

import { logAuditEvent } from "./auditLogger.js";
import { createAdminRouter } from "./adminRoutes.js";

import {
  analyzeInteractionFriction,
  emptyMetrics,
} from "./cognitiveEngine.js";

import {
  generateAdaptiveUIWithAI,
  checkAIServiceHealth,
} from "./aiAgent.js";

import { validateApplication } from "./application.js";

import {
  validateGeneratedCode,
} from "./security/generatedCodeValidator.js";

import {
  generateCodeStream,
} from "./generatedCodeGenerator.js";

import {
  sanitizeUIContext,
} from "./security/uiContext.js";

import {
  notFoundHandler,
  errorHandler,
} from "./errorHandler.js";

import { config } from "./config/environment.js";

import {
  connectDatabase,
  getDatabase,
  getApplicationsCollection,
  closeDatabase,
} from "./database.js";

// ==========================================
// STRUCTURED LOGGER
// ==========================================

const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "email",
      "fullName",
      "annualIncome",
    ],
    remove: true,
  },
});

// ==========================================
// EXPRESS SERVER
// ==========================================

const app = express();
const httpServer = createServer(app);
const port = config.port;

// ==========================================
// CORS CONFIGURATION
// ==========================================

const configuredOrigins =
  config.configuredOrigins.length > 0
    ? config.configuredOrigins
    : [
        "http://localhost:3000",
        "http://localhost:3001",
      ];

const isAllowedOrigin = (origin) => {
  if (!origin) {
    return true;
  }

  if (configuredOrigins.includes(origin)) {
    return true;
  }

  if (config.nodeEnv === "production") {
    return false;
  }

  return (
    /^https?:\/\/localhost:\d+$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1:\d+$/.test(origin)
  );
};

const corsOptions = {
  origin: (origin, callback) => {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
  methods: ["GET", "POST"],
  exposedHeaders: ["X-Request-ID"],
};

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

app.use(helmet());

app.use(
  pinoHttp({
    logger,
    quietReqLogger: true,
    genReqId: () => randomUUID(),
    autoLogging: {
      ignore: (req) => req.url === "/health",
    },
  })
);

app.use((req, res, next) => {
  if (req.id) {
    res.setHeader("X-Request-ID", req.id);
  }

  next();
});

app.use(cors(corsOptions));

app.use(express.json({ limit: "20kb" }));

// ==========================================
// SOCKET.IO CONFIGURATION
// ==========================================

const io = new Server(httpServer, {
  cors: corsOptions,
  maxHttpBufferSize: 1e5,

  allowRequest: (req, callback) => {
    const origin = req.headers.origin;

    callback(null, isAllowedOrigin(origin));
  },
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "AuraGen backend",
    environment: config.nodeEnv,
    aiProvider: config.aiProvider,
    aiModel: process.env.OLLAMA_MODEL || "llama3.2:3b",
  });
});

// ==========================================
// READINESS CHECK
// ==========================================

app.get("/ready", async (_req, res) => {
  let databaseHealth = {
    status: "available",
  };

  let aiHealth = {
    status: "unavailable",
  };

  try {
    await getDatabase().command({ ping: 1 });
  } catch {
    databaseHealth = {
      status: "unavailable",
    };
  }

  try {
    aiHealth = await checkAIServiceHealth();
  } catch {
    aiHealth = {
      status: "unavailable",
    };
  }

  const isReady =
    databaseHealth.status === "available" &&
    aiHealth.status === "available";

  return res.status(isReady ? 200 : 503).json({
    status: isReady ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
    dependencies: {
      database: databaseHealth,
      ai: aiHealth,
    },
  });
});

// ==========================================
// GENERATED CODE VALIDATION
// ==========================================

const generatedCodeValidationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    status: "error",
    message:
      "Too many code validation requests. Please try again later.",
  },
});

app.post(
  "/api/generated-code/validate",
  generatedCodeValidationLimiter,
  (req, res) => {
    const result = validateGeneratedCode(req.body?.source);

    if (!result.valid) {
      return res.status(400).json({
        status: "invalid",
        valid: false,
        issues: result.issues,
        requestId: req.id || null,
      });
    }

    return res.status(200).json({
      status: "valid",
      valid: true,
      issues: [],
      requestId: req.id || null,
    });
  }
);

// ==========================================
// GENERATED CODE STREAMING
// ==========================================

const generatedCodeStreamLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    status: "error",
    message:
      "Too many code generation requests. Please try again later.",
  },
});

app.post(
  "/api/generated-code/stream",
  generatedCodeStreamLimiter,
  async (req, res) => {
    const controller = new AbortController();

    res.status(200);
    res.setHeader(
      "Content-Type",
      "application/x-ndjson; charset=utf-8"
    );
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");

    const sendEvent = (event) => {
      if (!res.destroyed && !res.writableEnded) {
        res.write(`${JSON.stringify(event)}\n`);
      }
    };

    const handleDisconnect = () => {
      if (!res.writableEnded) {
        controller.abort();
      }
    };

    res.on("close", handleDisconnect);

    try {
      for await (const event of generateCodeStream({
        signal: controller.signal,
      })) {
        if (controller.signal.aborted) {
          break;
        }

        sendEvent(event);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        logger.error(
          { err: error, requestId: req.id },
          "Generated code streaming failed"
        );

        sendEvent({
          type: "error",
          message: "Code generation failed. Please try again.",
        });
      }
    } finally {
      res.off("close", handleDisconnect);

      if (!res.destroyed && !res.writableEnded) {
        res.end();
      }
    }
  }
);

// ==========================================
// APPLICATION RATE LIMITING
// ==========================================

const applicationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    status: "error",
    message:
      "Too many submission attempts. Please try again later.",
  },
});

app.use("/api/applications", applicationLimiter);

// ==========================================
// APPLICATION SUBMISSION
// ==========================================

app.post("/api/applications", async (req, res, next) => {
  try {
    const applicationData = {
      fullName: req.body?.fullName,
      email: req.body?.email,
      employment: req.body?.employment,
      annualIncome: req.body?.annualIncome,
    };

    const validation = validateApplication(applicationData);

    if (!validation.valid) {
      logAuditEvent(logger, "APPLICATION_REJECTED");

      return res.status(400).json({
        status: "invalid",
        message: validation.message,
        requestId: req.id || null,
      });
    }

    const applicationId = `AG-${randomUUID()
      .slice(0, 8)
      .toUpperCase()}`;

    const submittedAt = new Date();

    const applications = getApplicationsCollection();

    const result = await applications.insertOne({
      applicationId,

      fullName: applicationData.fullName.trim(),

      email: applicationData.email
        .trim()
        .toLowerCase(),

      employment: applicationData.employment,

      annualIncome: Number(applicationData.annualIncome),

      submittedAt,

      status: "submitted",
    });

    if (!result.acknowledged) {
      throw new Error(
        "MongoDB did not acknowledge the application insert."
      );
    }

    logAuditEvent(logger, "APPLICATION_ACCEPTED");

    logger.info(
      {
        applicationId,
        requestId: req.id || null,
      },
      "Application successfully stored"
    );

    return res.status(201).json({
      status: "submitted",
      message: "Your application was saved successfully.",
      applicationId,
      submittedAt: submittedAt.toISOString(),
      storage: "mongodb",
      requestId: req.id || null,
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// ADMIN AUTHENTICATION AND PROTECTED ROUTES
// ==========================================

app.use(
  "/api/admin",
  createAdminRouter({
    isAllowedOrigin,
    logger,
  })
);

// ==========================================
// CENTRALIZED ERROR HANDLING
// ==========================================

app.use(notFoundHandler);
app.use(errorHandler);

// ==========================================
// SOCKET CONNECTION
// ==========================================

io.on("connection", (socket) => {
  let metrics = emptyMetrics();

  // Context is isolated to this socket connection.
  // Only sanitized UI metadata is stored.
  let uiContext = sanitizeUIContext({});

  let lastAutomaticAdaptationAt = 0;
  let lastManualAdaptationAt = 0;

  let adaptationInProgress = false;
  let automaticAdaptationTriggered = false;

  let sessionVersion = 0;

  let eventWindowStarted = Date.now();
  let eventCount = 0;

  logAuditEvent(logger, "CLIENT_CONNECTED", {
    socketId: socket.id,
  });

  socket.emit("connection-status", {
    connected: true,
    message: "Connected to AuraGen backend",
  });

  // ========================================
  // PRIVACY-SAFE UI CONTEXT
  // ========================================

  socket.on("ui-context", (context = {}) => {
    if (
      !context ||
      typeof context !== "object" ||
      Array.isArray(context)
    ) {
      return;
    }

    // Remove unapproved fields and all actual form values.
    uiContext = sanitizeUIContext(context);

    logger.info(
      {
        socketId: socket.id,
        currentStep: uiContext.currentStep,
        completedFieldCount: uiContext.completedFieldCount,
      },
      "UI context updated"
    );
  });

  // ========================================
  // TELEMETRY PROCESSING
  // ========================================

  socket.on("telemetry", async (event = {}) => {
    if (
      !event ||
      typeof event !== "object" ||
      Array.isArray(event)
    ) {
      return;
    }

    const nowForLimit = Date.now();

    if (nowForLimit - eventWindowStarted >= 60000) {
      eventWindowStarted = nowForLimit;
      eventCount = 0;
    }

    eventCount += 1;

    if (eventCount > 120) {
      return;
    }

    // Update recognized interaction metrics.
    for (const key of Object.keys(metrics)) {
      const increment = Number(event[key] ?? 0);

      if (
        Number.isFinite(increment) &&
        increment > 0
      ) {
        metrics[key] = Math.min(
          metrics[key] + Math.min(Math.floor(increment), 5),
          100
        );
      }
    }

    const analysis = analyzeInteractionFriction(metrics);
    const { score } = analysis;

    socket.emit("load-score", analysis);

    if (score < 60) {
      automaticAdaptationTriggered = false;
      return;
    }

    // ========================================
    // AUTOMATIC ADAPTATION
    // ========================================

    const now = Date.now();

    const thresholdReached = score >= 60;

    const cooldownComplete =
      now - lastAutomaticAdaptationAt >= 8000;

    const notAlreadyTriggered =
      !automaticAdaptationTriggered;

    if (
      thresholdReached &&
      cooldownComplete &&
      notAlreadyTriggered &&
      !adaptationInProgress
    ) {
      const requestSessionVersion = sessionVersion;

      automaticAdaptationTriggered = true;
      lastAutomaticAdaptationAt = now;
      adaptationInProgress = true;

      logAuditEvent(logger, "ADAPTATION_REQUESTED", {
        socketId: socket.id,
        adaptationType: "automatic",
        score,
      });

      logger.info(
        { score, socketId: socket.id },
        "Automatic adaptation triggered"
      );

      try {
        const uiConfig = await generateAdaptiveUIWithAI(
          { ...metrics },
          { uiContext }
        );

        if (
          socket.connected &&
          requestSessionVersion === sessionVersion
        ) {
          if (
            !uiConfig ||
            typeof uiConfig !== "object"
          ) {
            throw new Error(
              "AI returned an invalid UI configuration."
            );
          }

          logAuditEvent(logger, "ADAPTATION_GENERATED", {
            socketId: socket.id,
            adaptationType: "automatic",
            provider: uiConfig.generatedBy || "unknown",
            score,
          });

          logger.info(
            {
              provider:
                uiConfig.generatedBy || "Unknown provider",
              score,
              socketId: socket.id,
            },
            "Automatic adaptation generated"
          );

          socket.emit("adapt-ui", {
            uiConfig,
            score,
            reason:
              uiConfig.explanation ||
              "Automatic adaptation triggered by high interaction friction.",
            adaptationType: "automatic",
          });
        }
      } catch {
        logAuditEvent(logger, "ADAPTATION_FAILED", {
          socketId: socket.id,
          adaptationType: "automatic",
        });

        logger.error(
          { socketId: socket.id },
          "Automatic adaptation failed"
        );

        if (requestSessionVersion === sessionVersion) {
          automaticAdaptationTriggered = false;
        }
      } finally {
        adaptationInProgress = false;
      }
    }
  });

  // ========================================
  // MANUAL ADAPTATION
  // ========================================

  socket.on(
    "request-adaptation",
    async (payload = {}) => {
      logger.info(
        { socketId: socket.id },
        "Manual adaptation request received"
      );

      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload)
      ) {
        return;
      }

      const manualNow = Date.now();

      if (
        adaptationInProgress ||
        manualNow - lastManualAdaptationAt < 5000
      ) {
        logger.warn(
          { socketId: socket.id },
          "Manual adaptation ignored: busy or cooldown"
        );

        return;
      }

      lastManualAdaptationAt = manualNow;
      adaptationInProgress = true;

      const requestSessionVersion = sessionVersion;

      logAuditEvent(logger, "ADAPTATION_REQUESTED", {
        socketId: socket.id,
        adaptationType: "manual",
      });

      // Analyze genuine interaction metrics.
      // Manual adaptation must not invent user interactions.
      const analysis = analyzeInteractionFriction(metrics);
      const { score } = analysis;

      socket.emit("load-score", analysis);

      try {
        const uiConfig = await generateAdaptiveUIWithAI(
          { ...metrics },
          { uiContext }
        );

        if (
          !uiConfig ||
          typeof uiConfig !== "object"
        ) {
          throw new Error(
            "AI returned an invalid UI configuration."
          );
        }

        if (
          socket.connected &&
          requestSessionVersion === sessionVersion
        ) {
          logAuditEvent(logger, "ADAPTATION_GENERATED", {
            socketId: socket.id,
            adaptationType: "manual",
            provider: uiConfig.generatedBy || "unknown",
            score,
          });

          logger.info(
            {
              provider:
                uiConfig.generatedBy || "Unknown provider",
              score,
              socketId: socket.id,
            },
            "Manual adaptation generated"
          );

          socket.emit("adapt-ui", {
            uiConfig,
            score,
            reason:
              uiConfig.explanation ||
              "Manual adaptation requested by the user.",
            adaptationType: "manual",
          });
        }
      } catch {
        logAuditEvent(logger, "ADAPTATION_FAILED", {
          socketId: socket.id,
          adaptationType: "manual",
        });

        logger.error(
          { socketId: socket.id },
          "Manual adaptation failed"
        );
      } finally {
        adaptationInProgress = false;
      }
    }
  );

  // ========================================
  // RESET SESSION
  // ========================================

  socket.on("reset-session", () => {
    metrics = emptyMetrics();

    // Clear previous UI context as well as telemetry.
    uiContext = sanitizeUIContext({});

    lastAutomaticAdaptationAt = 0;
    lastManualAdaptationAt = 0;

    automaticAdaptationTriggered = false;

    sessionVersion += 1;

    const analysis = analyzeInteractionFriction(metrics);

    socket.emit("load-score", analysis);

    logger.info(
      { socketId: socket.id },
      "Session metrics and UI context reset"
    );
  });

  // ========================================
  // CLIENT DISCONNECT
  // ========================================

  socket.on("disconnect", (reason) => {
    logAuditEvent(logger, "CLIENT_DISCONNECTED", {
      socketId: socket.id,
    });

    logger.info(
      {
        socketId: socket.id,
        reason,
      },
      "AuraGen client disconnected"
    );
  });
});

// ==========================================
// SERVER STARTUP
// ==========================================

async function startServer() {
  let databaseStatus = "skipped";

  try {
    if (config.nodeEnv !== "test") {
      try {
        await connectDatabase();
        databaseStatus = "connected";
      } catch (error) {
        databaseStatus = "unavailable";

        if (config.nodeEnv === "production") {
          throw error;
        }

        logger.warn(
          {
            errorCode: error?.code || "DATABASE_UNAVAILABLE",
          },
          "MongoDB is unavailable. Starting the development server without database access."
        );
      }
    }

    await new Promise((resolve, reject) => {
      const onError = (error) => {
        httpServer.off("listening", onListening);
        reject(error);
      };

      const onListening = () => {
        httpServer.off("error", onError);
        resolve();
      };

      httpServer.once("error", onError);
      httpServer.once("listening", onListening);

      httpServer.listen(port);
    });

    logAuditEvent(logger, "SYSTEM_READY");

    logger.info(
      {
        port,
        environment: config.nodeEnv,
        aiProvider: config.aiProvider,
        database: databaseStatus,
      },
      "AuraGen backend started"
    );
  } catch (error) {
    // Never log the raw connection error because it may
    // contain sensitive connection details.
    logger.fatal(
      {
        errorCode: error?.code || "STARTUP_ERROR",
      },
      "AuraGen startup failed. Check database connectivity and configuration."
    );

    try {
      await closeDatabase();
    } catch {
      logger.error("Database cleanup failed during startup.");
    }

    process.exitCode = 1;
  }
}

startServer();

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  logger.info(
    { signal },
    "AuraGen shutdown initiated"
  );

  const forceShutdownTimer = setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10000);

  try {
    await new Promise((resolve) => {
      io.close(resolve);
    });

    await closeDatabase();

    logger.info("AuraGen server stopped");
    clearTimeout(forceShutdownTimer);
    process.exit(0);
  } catch {
    logger.error("Error during graceful shutdown");
    clearTimeout(forceShutdownTimer);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
