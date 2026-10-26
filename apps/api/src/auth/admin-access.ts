type AdminEnvironment = { ADMIN_USER_IDS?: string; ADMIN_EMAILS?: string };

/** Uses only the server allowlist; profile categories never grant admin access. */
export function isAdministrativeAccount(userId: string, email: string, environment: AdminEnvironment = process.env): boolean {
  const ids = (environment.ADMIN_USER_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const emails = (environment.ADMIN_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return ids.includes(userId) || emails.includes(email.trim().toLowerCase());
}

export type AdminRole = "ADMIN" | "COMMERCIAL" | "FINANCE" | "MODERATOR" | "SUPPORT" | "ANALYST";
export type AdminArea = "COMMERCIAL" | "FINANCE" | "MODERATION" | "ACCOUNTS" | "SUPPORT" | "ANALYTICS" | "TEAM" | "SETTINGS";
const access: Record<AdminRole, ReadonlySet<AdminArea>> = {
  ADMIN: new Set(["COMMERCIAL", "FINANCE", "MODERATION", "ACCOUNTS", "SUPPORT", "ANALYTICS", "TEAM", "SETTINGS"]),
  COMMERCIAL: new Set(["COMMERCIAL", "ANALYTICS"]),
  FINANCE: new Set(["FINANCE", "ANALYTICS"]),
  MODERATOR: new Set(["MODERATION", "ACCOUNTS", "SUPPORT"]),
  SUPPORT: new Set(["ACCOUNTS", "SUPPORT"]),
  ANALYST: new Set(["ANALYTICS"]),
};
export function hasAdminArea(role: string | undefined, area: AdminArea): boolean {
  return !!role && role in access && access[role as AdminRole].has(area);
}
