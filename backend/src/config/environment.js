
const DEFAULTS = {
  nodeEnv: "development",
  port: 4000,
  aiProvider: "ollama",
  ollamaUrl: "http://127.0.0.1:11434/api/generate",
  timeout: 12000,
  logLevel: "info",
};

export function validateEnvironment(env = process.env) {
  const errors = [];

  const nodeEnv = env.NODE_ENV || DEFAULTS.nodeEnv;
  const port = Number(env.PORT || DEFAULTS.port);
  const aiProvider = (
    env.AI_PROVIDER || DEFAULTS.aiProvider
  ).toLowerCase();

  const ollamaUrl = env.OLLAMA_URL || DEFAULTS.ollamaUrl;
  const timeout = Number(
    env.AI_TIMEOUT_MS || DEFAULTS.timeout
  );
  const logLevel = env.LOG_LEVEL || DEFAULTS.logLevel;

  // MongoDB configuration
  const mongoUri = env.MONGODB_URI || "";

  // Admin authentication configuration
  const adminUsername = (env.ADMIN_USERNAME || "").trim();
  const adminPasswordHash = env.ADMIN_PASSWORD_HASH || "";

  if (!["development", "test", "production"].includes(nodeEnv)) {
    errors.push(
      "NODE_ENV must be development, test, or production."
    );
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(
      "PORT must be an integer between 1 and 65535."
    );
  }

  if (!["ollama", "simulated"].includes(aiProvider)) {
    errors.push("AI_PROVIDER must be ollama or simulated.");
  }

  try {
    const parsedUrl = new URL(ollamaUrl);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      errors.push("OLLAMA_URL must use HTTP or HTTPS.");
    }
  } catch {
    errors.push("OLLAMA_URL must be a valid URL.");
  }

  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) {
    errors.push(
      "AI_TIMEOUT_MS must be between 1000 and 120000 milliseconds."
    );
  }

  const allowedLogLevels = [
    "fatal", "error", "warn", "info",
    "debug", "trace", "silent",
  ];

  if (!allowedLogLevels.includes(logLevel)) {
    errors.push("LOG_LEVEL must be a valid Pino log level.");
  }

  // MongoDB URI validation
  if (mongoUri) {
    try {
      const parsedMongoUri = new URL(mongoUri);

      if (
        !["mongodb:", "mongodb+srv:"].includes(
          parsedMongoUri.protocol
        )
      ) {
        errors.push(
          "MONGODB_URI must use mongodb:// or mongodb+srv://."
        );
      }
    } catch {
      errors.push("MONGODB_URI must be a valid MongoDB connection URI.");
    }
  } else if (nodeEnv === "production") {
    errors.push("MONGODB_URI is required in production.");
  }

  // Admin configuration: optional during the current development phase.
  if (adminUsername && adminUsername.length < 3) {
    errors.push("ADMIN_USERNAME must contain at least 3 characters.");
  }

  if (adminPasswordHash && !adminPasswordHash.startsWith("scrypt$")) {
    errors.push("ADMIN_PASSWORD_HASH must use the supported scrypt format.");
  }

  if (Boolean(adminUsername) !== Boolean(adminPasswordHash)) {
    errors.push(
      "ADMIN_USERNAME and ADMIN_PASSWORD_HASH must be configured together."
    );
  }

  if (nodeEnv === "production" && (!adminUsername || !adminPasswordHash)) {
    errors.push(
      "ADMIN_USERNAME and ADMIN_PASSWORD_HASH are required in production."
    );
  }

  const configuredOrigins = (
    env.CLIENT_ORIGIN || ""
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (nodeEnv === "production") {
    if (configuredOrigins.length === 0) {
      errors.push(
        "CLIENT_ORIGIN must be explicitly configured in production."
      );
    }

    for (const origin of configuredOrigins) {
      try {
        const parsedOrigin = new URL(origin);

        if (
          !["http:", "https:"].includes(parsedOrigin.protocol) ||
          parsedOrigin.origin !== origin ||
          parsedOrigin.protocol !== "https:"
        ) {
          errors.push(
            `Production CLIENT_ORIGIN must be a valid HTTPS origin: ${origin}`
          );
        }
      } catch {
        errors.push(`Invalid CLIENT_ORIGIN value: ${origin}`);
      }
    }
  }

  if (errors.length > 0) {
    const error = new Error(
      "AuraGen environment configuration failed:\n" +
      errors.map((item) => `- ${item}`).join("\n")
    );

    error.name = "EnvironmentValidationError";
    error.validationErrors = errors;
    throw error;
  }

  return {
    nodeEnv,
    port,
    aiProvider,
    ollamaUrl,
    timeout,
    logLevel,
    configuredOrigins,
    mongoUri,
    adminUsername,
    adminPasswordHash,
  };
}

export const config = validateEnvironment();
