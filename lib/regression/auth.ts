import { timingSafeEqual } from "node:crypto";

type Env = Record<string, string | undefined>;

// The pilot is inert until the owner enables it explicitly on the server and
// configures a dedicated secret (separate from MONITOR_SECRET).
export function regressionPilotEnabled(env: Env = process.env): boolean {
  return env.RANKFIX_REGRESSION_PILOT === "1" && (env.REGRESSION_SECRET || "").length >= 32;
}

export function regressionAuthorized(authorization: string | null, env: Env = process.env): boolean {
  const secret = env.REGRESSION_SECRET || "";
  if (secret.length < 32 || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authorization);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type GuardFailure = { status: 401 | 503; error: string };

export function regressionGuard(authorization: string | null, env: Env = process.env): GuardFailure | null {
  if (!regressionAuthorized(authorization, env)) return { status: 401, error: "Niet toegestaan." };
  if (!regressionPilotEnabled(env)) return { status: 503, error: "Regressiepilot is niet geactiveerd." };
  return null;
}
