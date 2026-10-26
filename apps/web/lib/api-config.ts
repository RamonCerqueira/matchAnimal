const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * API routes already include Nest's global `/api` prefix. Accept either an
 * origin or a configured URL ending in `/api` without duplicating that prefix.
 */
export const apiBaseUrl = configuredApiUrl
  .trim()
  .replace(/\/+$/, "")
  .replace(/(?:\/api)+$/i, "");
