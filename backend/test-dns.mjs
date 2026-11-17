import dns from "node:dns";
import { promises as dnsPromises } from "node:dns";

const record = "_mongodb._tcp.koushik.cz37jbn.mongodb.net";

try {
  console.log("Node.js default DNS:");
  console.log(await dnsPromises.resolveSrv(record));
} catch (error) {
  console.log("Default DNS failed:", error.code, error.message);
}

try {
  console.log("\nNode.js Google DNS:");
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
  console.log(await dnsPromises.resolveSrv(record));
} catch (error) {
  console.log("Google DNS failed:", error.code, error.message);
}
