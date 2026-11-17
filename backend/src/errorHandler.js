
const ERROR_CODES = {
  NOT_FOUND: "RESOURCE_NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_SERVER_ERROR",
  REQUEST_FAILED: "REQUEST_FAILED",
};

// ==========================================
// NOT FOUND HANDLER
// ==========================================

export function notFoundHandler(req, res) {
  return res.status(404).json({
    status: "error",
    code: ERROR_CODES.NOT_FOUND,
    message: `Route not found: ${req.method} ${req.path}`,
    requestId: req.id || null,
  });
}

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode =
    Number.isInteger(error.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode <= 599
      ? error.statusCode
      : 500;

  const isServerError = statusCode >= 500;

  const errorCode = isServerError
    ? ERROR_CODES.INTERNAL_ERROR
    : typeof error.code === "string" &&
        /^[A-Z0-9_]{1,50}$/.test(error.code)
      ? error.code
      : ERROR_CODES.REQUEST_FAILED;

  const requestId = req.id || null;

  // Log the request ID for easier error tracking.
  if (req.log) {
    req.log.error(
      {
        requestId,
        statusCode,
        errorCode,
        method: req.method,
        path: req.path,
        errorType:
          typeof error.name === "string"
            ? error.name.slice(0, 80)
            : "Error",
      },
      "HTTP request failed"
    );
  }

  // Do not expose internal server error details.
  const safeClientMessage =
    !isServerError &&
    error.expose === true &&
    typeof error.message === "string"
      ? error.message.slice(0, 200)
      : null;

  return res.status(statusCode).json({
    status: "error",
    code: errorCode,
    message:
      safeClientMessage ||
      (isServerError
        ? "An unexpected server error occurred."
        : "The request could not be processed."),
    requestId,
  });
}
