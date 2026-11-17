
"use client";
import "./admin.css";

import { useCallback, useEffect, useState } from "react";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
).replace(/\/$/, "");

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data.message || `Request failed with status ${response.status}`
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatIncome(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) return String(value);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [username, setUsername] = useState("admin");

  const [loginUsername, setLoginUsername] = useState("admin");
  const [password, setPassword] = useState("");

  const [applications, setApplications] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadApplications = useCallback(async (page = 1) => {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest(
        `/api/admin/applications?page=${page}&limit=20`
      );

      setApplications(data.applications || []);
      setPagination(
        data.pagination || {
          page,
          limit: 20,
          total: 0,
          totalPages: 1,
        }
      );
    } catch (err) {
      if (err.status === 401) {
        setAuthenticated(false);
        setApplications([]);
        setError("Your administrator session has expired. Please log in again.");
      } else {
        setError(err.message || "Unable to load applications.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const checkSession = useCallback(async () => {
    setCheckingSession(true);

    try {
      const data = await apiRequest("/api/admin/me");

      setAuthenticated(true);
      setUsername(data.username || "admin");
      await loadApplications(1);
    } catch {
      setAuthenticated(false);
      setApplications([]);
    } finally {
      setCheckingSession(false);
    }
  }, [loadApplications]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  async function handleLogin(event) {
    event.preventDefault();

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const data = await apiRequest("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          username: loginUsername.trim(),
          password,
        }),
      });

      setAuthenticated(true);
      setUsername(data.username || loginUsername.trim());
      setPassword("");
      setSuccess("Administrator login successful.");

      await loadApplications(1);
    } catch (err) {
      setError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await apiRequest("/api/admin/logout", {
        method: "POST",
      });

      setAuthenticated(false);
      setApplications([]);
      setPassword("");
      setSuccess("You have been securely logged out.");
    } catch (err) {
      setError(err.message || "Unable to complete logout.");
    } finally {
      setSubmitting(false);
    }
  }

  async function changePage(nextPage) {
    if (
      nextPage < 1 ||
      nextPage > pagination.totalPages ||
      loading
    ) {
      return;
    }

    await loadApplications(nextPage);
  }

  if (checkingSession) {
    return (
      <main className="admin-page">
        <div className="admin-loading">
          <div className="admin-spinner" />
          <p>Verifying administrator session...</p>
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="admin-page">
        <section className="admin-login-card">
          <div className="admin-brand">
            <div className="admin-brand-icon">A</div>
            <div>
              <h1>AuraGen</h1>
              <p>Administration Console</p>
            </div>
          </div>

          <div className="admin-login-heading">
            <span className="admin-eyebrow">SECURE ACCESS</span>
            <h2>Administrator Login</h2>
            <p>
              Sign in to securely manage submitted applications.
            </p>
          </div>

          {error && (
            <div className="admin-alert admin-alert-error" role="alert">
              {error}
            </div>
          )}

          {success && (
            <div className="admin-alert admin-alert-success" role="status">
              {success}
            </div>
          )}

          <form onSubmit={handleLogin} className="admin-login-form">
            <label htmlFor="admin-username">Username</label>
            <input
              id="admin-username"
              type="text"
              autoComplete="username"
              value={loginUsername}
              onChange={(event) => setLoginUsername(event.target.value)}
              required
            />

            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <button
              type="submit"
              className="admin-primary-button"
              disabled={submitting}
            >
              {submitting ? "Signing in..." : "Sign in securely"}
            </button>
          </form>

          <p className="admin-security-note">
            <span aria-hidden="true">🔒</span> Protected administrator access
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div className="admin-brand">
          <div className="admin-brand-icon">A</div>
          <div>
            <h1>AuraGen</h1>
            <p>Administration Console</p>
          </div>
        </div>

        <div className="admin-header-actions">
          <span className="admin-user-label">
            Signed in as <strong>{username}</strong>
          </span>
          <button
            type="button"
            className="admin-logout-button"
            onClick={handleLogout}
            disabled={submitting}
          >
            {submitting ? "Please wait..." : "Log out"}
          </button>
        </div>
      </header>

      <section className="admin-content">
        <div className="admin-page-heading">
          <div>
            <span className="admin-eyebrow">MANAGEMENT</span>
            <h2>Application Overview</h2>
            <p>Review and manage submitted applicant records.</p>
          </div>

          <button
            type="button"
            className="admin-refresh-button"
            onClick={() => loadApplications(pagination.page)}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>

        {error && (
          <div className="admin-alert admin-alert-error" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="admin-alert admin-alert-success" role="status">
            {success}
          </div>
        )}

        <section className="admin-stats">
          <article className="admin-stat-card">
            <span>Total Applications</span>
            <strong>{pagination.total}</strong>
            <small>Records in the database</small>
          </article>

          <article className="admin-stat-card">
            <span>Current Page</span>
            <strong>{pagination.page}</strong>
            <small>Of {pagination.totalPages} pages</small>
          </article>

          <article className="admin-stat-card">
            <span>Records Displayed</span>
            <strong>{applications.length}</strong>
            <small>On this page</small>
          </article>
        </section>

        <section className="admin-table-card">
          <div className="admin-table-heading">
            <div>
              <h3>Submitted Applications</h3>
              <p>Authenticated administrator records</p>
            </div>
            <span className="admin-record-count">
              {pagination.total} records
            </span>
          </div>

          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Application ID</th>
                  <th>Applicant</th>
                  <th>Email</th>
                  <th>Employment</th>
                  <th>Annual Income</th>
                  <th>Submitted</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="admin-empty-cell">
                      Loading application records...
                    </td>
                  </tr>
                ) : applications.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="admin-empty-cell">
                      No applications found.
                    </td>
                  </tr>
                ) : (
                  applications.map((application) => (
                    <tr key={application.applicationId}>
                      <td className="admin-application-id">
                        {application.applicationId || "—"}
                      </td>
                      <td>{application.fullName || "—"}</td>
                      <td>{application.email || "—"}</td>
                      <td>{application.employment || "—"}</td>
                      <td>{formatIncome(application.annualIncome)}</td>
                      <td>{formatDate(application.submittedAt)}</td>
                      <td>
                        <span className="admin-status">
                          {application.status || "Unknown"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="admin-pagination">
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>

            <div>
              <button
                type="button"
                onClick={() => changePage(pagination.page - 1)}
                disabled={loading || pagination.page <= 1}
              >
                Previous
              </button>

              <button
                type="button"
                onClick={() => changePage(pagination.page + 1)}
                disabled={
                  loading || pagination.page >= pagination.totalPages
                }
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <footer className="admin-footer">
          AuraGen · Secure Application Management
        </footer>
      </section>
    </main>
  );
}
