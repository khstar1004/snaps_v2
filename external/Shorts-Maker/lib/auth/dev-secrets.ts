import { createHash } from "node:crypto";

const LOCAL_DEVELOPMENT_SEED = [
  process.cwd(),
  process.env.USERPROFILE || process.env.HOME || "",
  process.env.USERNAME || process.env.USER || "",
  process.env.COMPUTERNAME || "",
].join("|");

export function deriveLocalDevelopmentSecret(purpose: string, length = 48): string {
  const digest = createHash("sha256")
    .update(`${LOCAL_DEVELOPMENT_SEED}|${purpose}`)
    .digest("base64url");
  if (digest.length >= length) {
    return digest.slice(0, length);
  }
  const fallback = createHash("sha256")
    .update(`${purpose}|fallback|${LOCAL_DEVELOPMENT_SEED}`)
    .digest("hex");
  return `${digest}${fallback}`.slice(0, length);
}

export function deriveLocalDevelopmentPassword(purpose: string): string {
  const token = createHash("sha256")
    .update(`${LOCAL_DEVELOPMENT_SEED}|password|${purpose}`)
    .digest("hex")
    .slice(0, 12);
  return `Dev${token}!A1`;
}
