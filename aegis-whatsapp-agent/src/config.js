import fs from "node:fs";

const initialEnvKeys = new Set(Object.keys(process.env));

function normaliseProfile(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function loadDotEnvFile(filePath, allowOverride = false) {
  if (!fs.existsSync(filePath)) return false;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");

    if (initialEnvKeys.has(key)) continue;
    if (!allowOverride && process.env[key]) continue;

    process.env[key] = value;
  }

  return true;
}

const requestedProfile = normaliseProfile(process.env.PROFILE || process.env.AEGIS_PROFILE);
loadDotEnvFile(".env");

if (requestedProfile) {
  loadDotEnvFile(`.env.${requestedProfile}`, true);
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildHostedPublicBaseUrl(port) {
  const explicit = String(process.env.PUBLIC_BASE_URL || "").trim();
  if (explicit) return explicit;

  const railwayDomain = String(process.env.RAILWAY_PUBLIC_DOMAIN || "").trim();
  if (railwayDomain) {
    return railwayDomain.startsWith("http")
      ? railwayDomain
      : `https://${railwayDomain}`;
  }

  return `http://localhost:${port}`;
}

export function getConfig() {
  const profile = requestedProfile || "default";
  const storePath = process.env.STORE_PATH || `./data/store.${profile}.json`;
  const ownerWhatsappTo = process.env.OWNER_WHATSAPP_TO ||
    (process.env.OWNER_PHONE_NUMBER ? `whatsapp:${process.env.OWNER_PHONE_NUMBER}` : "");
  const port = Number(process.env.PORT || 8787);
  const publicBaseUrl = buildHostedPublicBaseUrl(port);

  return {
    profile,
    port,
    publicBaseUrl,
    openai: {
      apiKey: required("OPENAI_API_KEY"),
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
    },
    google: {
      clientId: required("GOOGLE_CLIENT_ID"),
      clientSecret: required("GOOGLE_CLIENT_SECRET"),
      redirectUri: process.env.GOOGLE_REDIRECT_URI || `${publicBaseUrl}/auth/google/callback`,
    },
    twilio: {
      accountSid: required("TWILIO_ACCOUNT_SID"),
      authToken: required("TWILIO_AUTH_TOKEN"),
      whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886",
      ownerWhatsappTo: ownerWhatsappTo || required("OWNER_WHATSAPP_TO"),
      actionContentSid: process.env.TWILIO_ACTION_CONTENT_SID || "",
      digestContentSid: process.env.TWILIO_DIGEST_CONTENT_SID || "",
    },
    app: {
      profile,
      agentDisplayName: process.env.AGENT_DISPLAY_NAME || "Aegis Agent",
      maxEmailsPerCheck: Number(process.env.MAX_EMAILS_PER_CHECK || 5),
      storePath,
      digestEnabled: ["1", "true", "yes"].includes(String(process.env.DIGEST_ENABLED || "").toLowerCase()),
      digestIntervalMinutes: Number(process.env.DIGEST_INTERVAL_MINUTES || 60),
      digestStartupScan: ["1", "true", "yes"].includes(String(process.env.DIGEST_STARTUP_SCAN || "").toLowerCase()),
    },
  };
}
