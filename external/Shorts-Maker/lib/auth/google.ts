import { google } from "googleapis";

type GoogleProfile = {
  email: string;
};

function getGoogleOauthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
  const appBaseUrl = process.env.APP_BASE_URL?.trim() || "";
  const redirectFromBase = appBaseUrl ? `${appBaseUrl.replace(/\/$/, "")}/api/auth/google/callback` : "";
  const redirectUri = process.env.AUTH_GOOGLE_REDIRECT_URI?.trim() || redirectFromBase || "http://localhost:3000/api/auth/google/callback";
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required");
  }
  return { clientId, clientSecret, redirectUri };
}

function createGoogleOauthClient() {
  const cfg = getGoogleOauthConfig();
  return new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
}

export function getGoogleAuthUrl(state: string): string {
  const client = createGoogleOauthClient();
  return client.generateAuthUrl({
    access_type: "online",
    include_granted_scopes: true,
    prompt: "select_account",
    scope: ["openid", "email", "profile"],
    state,
  });
}

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const client = createGoogleOauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const profile = await oauth2.userinfo.get();
  const email = String(profile.data.email || "").trim().toLowerCase();
  if (!email) {
    throw new Error("Google 계정 이메일을 확인할 수 없습니다.");
  }
  return { email };
}
