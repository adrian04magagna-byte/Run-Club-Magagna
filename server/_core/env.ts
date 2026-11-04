const list = (value: string | undefined) =>
  (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);

export const ENV = {
  // Signs session tokens. Must be a long random value in production.
  sessionSecret: process.env.SESSION_SECRET ?? process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  coachEmail: process.env.COACH_EMAIL ?? "",
  // Required to create the coach's email/password login (prevents anyone else claiming COACH_EMAIL).
  coachSignupCode: process.env.COACH_SIGNUP_CODE?.trim() ?? "",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? process.env.API_BASE_URL?.trim() ?? "",
  // Web origins allowed to call the API, e.g. https://user.github.io,http://localhost:8081
  allowedOrigins: list(process.env.ALLOWED_ORIGINS),
  // Where Google sign-in may send people back to (web app URLs and the native app scheme).
  appReturnUrls: list(process.env.APP_RETURN_URLS),
  googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "",
  stravaClientId: process.env.STRAVA_CLIENT_ID?.trim() ?? "",
  stravaClientSecret: process.env.STRAVA_CLIENT_SECRET?.trim() ?? "",
  stravaTokenEncryptionKey: process.env.STRAVA_TOKEN_ENCRYPTION_KEY?.trim() ?? "",
  isProduction: process.env.NODE_ENV === "production",
};

export function isCoachEmail(email: string | null | undefined): boolean {
  return Boolean(ENV.coachEmail) && email?.trim().toLowerCase() === ENV.coachEmail.trim().toLowerCase();
}
