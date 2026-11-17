import "dotenv/config";
import dns from "node:dns";
import tls from "node:tls";
import { MongoClient } from "mongodb";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const secureContext = tls.createSecureContext({
  minVersion: "TLSv1.2",
  maxVersion: "TLSv1.2",
});

const client = new MongoClient(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 10000,
  secureContext,
});

try {
  await client.connect();
  await client.db("auragen").command({ ping: 1 });
  console.log("MongoDB TLS 1.2 connection and ping successful");
} catch (error) {
  console.error("MongoDB test failed:", error.name, error.code || "", error.message);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
