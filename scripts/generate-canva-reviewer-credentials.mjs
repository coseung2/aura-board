import { randomBytes, scryptSync } from "node:crypto";

const password = randomBytes(18).toString("base64url");
const salt = randomBytes(16);
const derived = scryptSync(password, salt, 64);
const hash = `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;

process.stdout.write(
  [
    "Generated a one-time Canva reviewer password.",
    "Copy the password into the Canva review ticket and store only the hash in Infisical.",
    "",
    `Password: ${password}`,
    `CANVA_REVIEWER_PASSWORD_HASH=${hash}`,
    "",
  ].join("\n"),
);
