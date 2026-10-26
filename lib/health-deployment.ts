// These signals identify the hosting environment; app availability is checked separately.
// ProcessEnv has a string index signature, so keep this type compatible with it.
export type HealthEnvironment = Record<string, string | undefined>;

export type DeploymentStatus = {
  key: "deployment";
  label: "Deployment";
  level: "green" | "orange";
  message: string;
};

export function getDeploymentStatus(env: HealthEnvironment): DeploymentStatus {
  if (env.VERCEL === "1") {
    const stage = ["production", "preview", "development"].includes(env.VERCEL_ENV || "")
      ? ` (${env.VERCEL_ENV})`
      : "";
    return {
      key: "deployment",
      label: "Deployment",
      level: "green",
      message: `Vercel-runtime herkend${stage}. Bereikbaarheid van de app wordt apart gecontroleerd.`,
    };
  }
  if (env.RENDER === "true") {
    return {
      key: "deployment",
      label: "Deployment",
      level: "green",
      message: "Render-runtime herkend. Bereikbaarheid van de app wordt apart gecontroleerd.",
    };
  }
  return {
    key: "deployment",
    label: "Deployment",
    level: "orange",
    message: "Hosting-runtime niet bevestigd; controleer de omgevingsconfiguratie.",
  };
}

export function getHealthAppUrl(env: HealthEnvironment): string {
  const configured = env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  // Prefer the live project domain over a possibly protected preview URL.
  const productionDomain = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionDomain) return `https://${productionDomain.replace(/\/+$/, "")}`;

  if (env.RENDER === "true") return "https://rankfix-app.onrender.com";
  return "https://rankfix-app.vercel.app";
}
