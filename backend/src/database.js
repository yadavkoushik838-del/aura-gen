import { MongoClient } from "mongodb";
import { config } from "./config/environment.js";

let client;
let database;

function getConnectionUri() {
  const isDevelopmentAtlas =
    config.nodeEnv === "development" &&
    config.mongoUri.startsWith("mongodb+srv://");

  if (!isDevelopmentAtlas) {
    return config.mongoUri;
  }

  const originalUri = new URL(config.mongoUri);

  // Use verified Atlas nodes to avoid Node.js SRV/TXT DNS failures.
  const hosts = [
    "ac-rpdnotn-shard-00-00.cz37jbn.mongodb.net:27017",
    "ac-rpdnotn-shard-00-01.cz37jbn.mongodb.net:27017",
    "ac-rpdnotn-shard-00-02.cz37jbn.mongodb.net:27017",
  ];

  const credentials = originalUri.username
    ? `${originalUri.username}${originalUri.password ? ":" + originalUri.password : ""}@`
    : "";

  const options = new URLSearchParams(originalUri.search);

  options.set("authSource", "admin");
  options.set("replicaSet", "atlas-dzva7k-shard-0");
  options.set("tls", "true");

  return `mongodb://${credentials}${hosts.join(",")}${originalUri.pathname || "/"}?${options.toString()}`;
}

export async function connectDatabase() {
  if (database) {
    return database;
  }

  if (!config.mongoUri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  const connectionUri = getConnectionUri();

  client = new MongoClient(connectionUri, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 20000,
    retryReads: true,
    retryWrites: true,
  });

  try {
    await client.connect();

    database = client.db("auragen");

    await database.command({ ping: 1 });

    await database.collection("applications").createIndex(
      { applicationId: 1 },
      { unique: true }
    );

    await database.collection("applications").createIndex(
      { submittedAt: -1 }
    );

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
