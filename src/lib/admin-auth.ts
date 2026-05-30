import crypto from "node:crypto";

export const ADMIN_SESSION_COOKIE = "cloud_changelog_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const REQUIRED_COMMANDS = [
  "whoami",
  "pwd",
  "ls",
  "cat manifest.txt",
  "sudo -i",
];

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.SYNC_SECRET || "cloud-changelog-admin-secret";
}

function base64UrlEncode(input: string) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

export function normalizeCommand(command: string) {
  return command.trim().replace(/\s+/g, " ");
}

export function validateCommandSequence(commands: string[]) {
  if (!Array.isArray(commands) || commands.length !== REQUIRED_COMMANDS.length) {
    return false;
  }

  return commands.every((command, index) => normalizeCommand(command) === REQUIRED_COMMANDS[index]);
}

export function createAdminSessionToken() {
  const issuedAt = Date.now();
  const payload = JSON.stringify({ issuedAt });
  const signature = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("hex");

  return `${base64UrlEncode(payload)}.${signature}`;
}

export function verifyAdminSessionToken(token: string | undefined | null) {
  if (!token) return false;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;

  let payloadText = "";
  try {
    payloadText = base64UrlDecode(encodedPayload);
  } catch {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", getSecret())
    .update(payloadText)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return false;
  }

  try {
    const parsed = JSON.parse(payloadText) as { issuedAt?: number };
    if (typeof parsed.issuedAt !== "number") return false;
    return Date.now() - parsed.issuedAt < SESSION_TTL_MS;
  } catch {
    return false;
  }
}

export function readCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return "";

  const cookies = cookieHeader.split(";").map((part) => part.trim());
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

