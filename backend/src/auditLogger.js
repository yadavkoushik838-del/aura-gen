
const ALLOWED_EVENTS = new Set([
  "CLIENT_CONNECTED",
  "CLIENT_DISCONNECTED",
  "ADAPTATION_REQUESTED",
  "ADAPTATION_GENERATED",
  "ADAPTATION_FAILED",
  "APPLICATION_ACCEPTED",
  "APPLICATION_REJECTED",
  "SYSTEM_READY",

  // Administrator security events.
  "ADMIN_LOGIN_SUCCEEDED",
  "ADMIN_LOGIN_FAILED",
  "ADMIN_LOGOUT",
  "ADMIN_SESSION_REJECTED",
  "ADMIN_APPLICATIONS_ACCESSED",
]);

export function logAuditEvent(logger, event, details = {}) {
  if (!ALLOWED_EVENTS.has(event)) {
    logger.warn(
      { event },
      "Unknown audit event rejected"
    );
    return;
  }

  // Only explicitly approved, non-sensitive metadata is logged.
  const safeDetails = {
    ...(typeof details.socketId === "string"
      ? { socketId: details.socketId.slice(0, 100) }
      : {}),

    ...(typeof details.adaptationType === "string"
      ? { adaptationType: details.adaptationType.slice(0, 50) }
      : {}),

    ...(typeof details.provider === "string"
      ? { provider: details.provider.slice(0, 50) }
      : {}),

    ...(Number.isFinite(details.score)
      ? { score: details.score }
      : {}),

    ...(typeof details.reason === "string"
      ? { reason: details.reason.slice(0, 120) }
      : {}),

    ...(Number.isInteger(details.resultCount)
      ? { resultCount: Math.max(0, details.resultCount) }
      : {}),
  };

  logger.info(
    {
      audit: true,
      event,
      ...safeDetails,
    },
    "AuraGen audit event"
  );
}
