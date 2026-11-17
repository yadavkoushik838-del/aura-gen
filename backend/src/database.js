
import dns from "node:dns";
import tls from "node:tls";
import { MongoClient } from "mongodb";
import { config } from "./config/environment.js";

let client;
let database;

export async function connectDatabase() {
  if (database) {
    return database;
  }

  if (!config.mongoUri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  const isDevelopmentAtlas =
    config.nodeEnv === "development" &&
    config.mongoUri.startsWith("mongodb+srv://");

  // Windows development DNS configuration for MongoDB SRV.
  if (isDevelopmentAtlas) {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  }

  // Explicit TLS 1.2 for the verified Windows/Atlas connection.
  const tlsOptions = isDevelopmentAtlas
    ? {
        secureContext: tls.createSecureContext({
          minVersion: "TLSv1.2",
          maxVersion: "TLSv1.2",
        }),
      }
    : {};

  client = new MongoClient(config.mongoUri, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 20000,
    retryReads: true,
    retryWrites: true,
    ...tlsOptions,
  });

  try {
    await client.connect();

    database = client.db("auragen");

    // Verify database connectivity.
    await database.command({ ping: 1 });

    // Application indexes.
    await database.collection("applications").createIndex(
      { applicationId: 1 },
      { unique: true }
    );

    await database.collection("applications").createIndex(
      { submittedAt: -1 }
    );

    // Administrator session indexes.
    const sessions = database.collection("admin_sessions");

    await sessions.createIndex(
      { tokenHash: 1 },
      { unique: true }
    );

    await sessions.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 }
    );

    console.log("MongoDB connected successfully.");
    console.log("AuraGen application indexes verified.");
    console.log("AuraGen admin session indexes verified.");

    return database;
  } catch (error) {
    // Print useful diagnostics without exposing credentials.
    console.error("MongoDB connection diagnostic:", {
      name: error?.name || "UnknownError",
      code: error?.code || null,
      codeName: error?.codeName || null,
      message: String(error?.message || "Unknown database error")
        .replace(
          /mongodb(\+srv)?:\/\/[^@\s]+@/gi,
          "mongodb$1://[REDACTED]@"
        )
        .slice(0, 1000),
    });

    if (client) {
      await client.close().catch(() => {});
    }

    client = undefined;
    database = undefined;

    throw error;
  }
}

export function getDatabase() {
  if (!database) {
    throw new Error("MongoDB database is not connected.");
  }

  return database;
}

export function getApplicationsCollection() {
  return getDatabase().collection("applications");
}

export function getAdminSessionsCollection() {
  return getDatabase().collection("admin_sessions");
}

export async function closeDatabase() {
  if (client) {
    await client.close();

    client = undefined;
    database = undefined;

    console.log("MongoDB connection closed.");
  }
}
