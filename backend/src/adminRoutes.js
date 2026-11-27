
import express from "express";
import rateLimit from "express-rate-limit";

import { config } from "./config/environment.js";
import { verifyAdminPassword } from "./adminAuth.js";

import {
  createAdminSession,
  findAdminSession,
  revokeAdminSession,
} from "./adminSessions.js";

import {
  getApplicationsCollection,
} from "./database.js";

import { logAuditEvent } from "./auditLogger.js";

const COOKIE_NAME = "auragen_admin_session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function getSessionToken(req) {
  const cookieHeader = req.headers.cookie || "";

  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const name = item.slice(0, separator).trim();

    if (name !== COOKIE_NAME) {
      continue;
    }

    try {
      return decodeURIComponent(
        item.slice(separator + 1).trim()
      );
    } catch {
      return null;
    }
  }

  return null;
}

function setSessionCookie(res, token, nodeEnv) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/api/admin",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];

  if (nodeEnv === "production") {
    parts.push("Secure");
  }

  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res, nodeEnv) {
  const parts = [
    `${COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/api/admin",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (nodeEnv === "production") {
    parts.push("Secure");
  }

  res.setHeader("Set-Cookie", parts.join("; "));
}

export function createAdminRouter({
  isAllowedOrigin,
  logger,

  // Optional dependencies for isolated testing.
  adminConfig = config,
  createSession = createAdminSession,
  findSession = findAdminSession,
  revokeSession = revokeAdminSession,
  getApplications = getApplicationsCollection,
}) {
  const router = express.Router();

  // Require a trusted browser origin for every admin request.
  router.use((req, res, next) => {
    const origin = req.get("origin");

    if (!origin || !isAllowedOrigin(origin)) {
      return res.status(403).json({
        status: "error",
        message: "Request origin is not allowed.",
      });
    }

    next();
  });

  // Limit repeated administrator login attempts.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      status: "error",
      message: "Too many login attempts. Try again later.",
    },
  });

  // Authenticate an administrator.
  router.post("/login", loginLimiter, async (req, res, next) => {
    try {
      if (
        !adminConfig.adminUsername ||
        !adminConfig.adminPasswordHash
      ) {
        return res.status(503).json({
          status: "error",
          message: "Administrator authentication is not configured.",
        });
      }

      const username = req.body?.username;
      const password = req.body?.password;

      if (
        typeof username !== "string" ||
        typeof password !== "string" ||
        username.length > 256 ||
        password.length > 1024
      ) {
        logAuditEvent(logger, "ADMIN_LOGIN_FAILED");

        return res.status(401).json({
          status: "error",
          message: "Invalid administrator credentials.",
        });
      }

      const passwordMatches = await verifyAdminPassword(
        password,
        adminConfig.adminPasswordHash
      );

      if (
        username !== adminConfig.adminUsername ||
        !passwordMatches
      ) {
        logAuditEvent(logger, "ADMIN_LOGIN_FAILED");

        return res.status(401).json({
          status: "error",
          message: "Invalid administrator credentials.",
        });
      }

      const session = await createSession(
        adminConfig.adminUsername
      );

      setSessionCookie(
        res,
        session.token,
        adminConfig.nodeEnv
      );

      logAuditEvent(logger, "ADMIN_LOGIN_SUCCEEDED");

      return res.status(200).json({
        status: "authenticated",
        username: adminConfig.adminUsername,
        expiresAt: session.expiresAt.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  // Require an active administrator session.
  async function requireAdmin(req, res, next) {
    try {
      const token = getSessionToken(req);
      const session = await findSession(token);

      if (!session) {
        logAuditEvent(logger, "ADMIN_SESSION_REJECTED");

        return res.status(401).json({
          status: "error",
          message: "Administrator authentication required.",
        });
      }

      req.admin = session;

      next();
    } catch (error) {
      next(error);
    }
  }

  // Check the current administrator session.
  router.get("/me", requireAdmin, (req, res) => {
    return res.json({
      status: "authenticated",
      username: req.admin.username,
      expiresAt: req.admin.expiresAt.toISOString(),
    });
  });

  // Revoke the current administrator session.
  router.post("/logout", async (req, res, next) => {
    try {
      const token = getSessionToken(req);

      if (token) {
        const revoked = await revokeSession(token);

        if (revoked) {
          logAuditEvent(logger, "ADMIN_LOGOUT");
        }
      }

      clearSessionCookie(res, adminConfig.nodeEnv);

      return res.status(200).json({
        status: "logged_out",
        message: "Administrator session ended.",
      });
    } catch (error) {
      next(error);
    }
  });

  // Return paginated applicant records to authenticated admins only.
  router.get(
    "/applications",
    requireAdmin,
    async (req, res, next) => {
      try {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);

        if (
          !Number.isSafeInteger(page) ||
          page < 1 ||
          page > 1000000 ||
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > 100
        ) {
          return res.status(400).json({
            status: "error",
            message: "Invalid pagination parameters.",
          });
        }

        const applications = getApplications();

        const [items, total] = await Promise.all([
          applications
            .find({})
            .sort({ submittedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .project({
              _id: 0,
              applicationId: 1,
              fullName: 1,
              email: 1,
              employment: 1,
              annualIncome: 1,
              submittedAt: 1,
              status: 1,
            })
            .toArray(),

          applications.countDocuments(),
        ]);

        logAuditEvent(
          logger,
          "ADMIN_APPLICATIONS_ACCESSED",
          { resultCount: items.length }
        );

        return res.json({
          status: "success",
          applications: items,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
