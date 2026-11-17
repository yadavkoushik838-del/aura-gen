
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashAdminPassword(password) {
  if (typeof password !== "string" || password.length < 12) {
    throw new Error("Admin password must contain at least 12 characters.");
  }

  const salt = randomBytes(SALT_LENGTH).toString("hex");

  const derivedKey = await scrypt(
    password,
    salt,
    KEY_LENGTH
  );

  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

export async function verifyAdminPassword(password, storedHash) {
  if (
    typeof password !== "string" ||
    typeof storedHash !== "string"
  ) {
    return false;
  }

  const parts = storedHash.split("$");

  if (
    parts.length !== 3 ||
    parts[0] !== "scrypt" ||
    !/^[a-f0-9]{32}$/i.test(parts[1]) ||
    !/^[a-f0-9]{128}$/i.test(parts[2])
  ) {
    return false;
  }

  try {
    const expectedKey = Buffer.from(parts[2], "hex");

    const actualKey = await scrypt(
      password,
      parts[1],
      KEY_LENGTH
    );

    return timingSafeEqual(
      actualKey,
      expectedKey
    );
  } catch {
    return false;
  }
}
