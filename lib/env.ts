const REQUIRED = [
  "NEXTAUTH_SECRET",
  "MONGODB_URI",
  "NEXTAUTH_URL",
] as const;

/**
 * Validates required environment variables at startup.
 * Throws immediately so misconfigured deployments fail fast instead of
 * surfacing cryptic errors at request time.
 */
export function validateEnv(): void {
  const missing = REQUIRED.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `[env] Missing required environment variables: ${missing.join(", ")}. ` +
        `Set them in .env.local (development) or your hosting provider's dashboard (production).`
    );
  }
}
