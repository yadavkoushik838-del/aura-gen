import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { writeSync } from "node:fs";

const scrypt = promisify(scryptCallback);

try {
  const securePassword = await import("node:readline/promises");
  const readline = securePassword.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const password = await readline.question("Enter your new admin password: ");
  readline.close();

  if (password.length < 12) {
    throw new Error("Password must contain at least 12 characters.");
  }

  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  const hash = `scrypt$${salt}$${key.toString("hex")}`;

  const { spawnSync } = await import("node:child_process");
  const copy = spawnSync("clip", [], {
    input: hash,
    encoding: "utf8",
  });

  if (copy.status !== 0) {
    throw new Error("Could not copy hash to clipboard.");
  }

  console.log("SUCCESS: Complete scrypt hash copied to clipboard.");
  console.log("Hash length:", hash.length);
} catch (error) {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
}
