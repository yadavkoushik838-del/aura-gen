export function isOriginAllowed(
  origin,
  { nodeEnv, configuredOrigins }
) {
  // Preserve existing behavior for requests without an Origin header.
  if (!origin) {
    return true;
  }

  // Explicitly configured origins must match exactly.
  if (configuredOrigins.includes(origin)) {
    return true;
  }

  // Production rejects every origin not explicitly configured.
  if (nodeEnv === "production") {
    return false;
  }

  // Development and test environments allow local development ports.
  return (
    /^https?:\/\/localhost:\d+$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1:\d+$/.test(origin)
  );
}