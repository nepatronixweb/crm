interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

/**
 * Returns true if the request is within the allowed rate, false if blocked.
 * @param key         Unique identifier — e.g. `"login:user@example.com"` or an IP.
 * @param maxAttempts Maximum allowed attempts within the window (default: 10).
 * @param windowMs    Sliding window in milliseconds (default: 60 s).
 */
export function checkRateLimit(
  key: string,
  maxAttempts = 10,
  windowMs = 60_000
): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxAttempts) return false;
  entry.count++;
  return true;
}

/** Remove a key (e.g. after successful login). */
export function clearRateLimit(key: string): void {
  store.delete(key);
}
