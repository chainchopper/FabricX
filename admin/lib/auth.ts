import { cookies } from "next/headers";
import { audit, newId, q, q1 } from "./db";
import { decryptSecret } from "./secrets";

// Session auth (spec §2.4): server-side session row + HttpOnly cookie,
// 12-hour absolute lifetime, sign-out revokes the row.

export const SESSION_COOKIE = "fabric_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface AdminUserRow {
  id: string;
  username: string;
  password_hash: string;
  totp_secret_enc: string | null;
  recovery_code_hashes: string[];
}

export async function createSession(userId: string): Promise<string> {
  const id = newId();
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await q(
    `INSERT INTO admin_sessions (id, admin_user_id, expires_at) VALUES ($1,$2,$3)`,
    [id, userId, expires.toISOString()]
  );
  return id;
}

export async function setSessionCookie(sessionId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Resolve the current admin user from the session cookie, or null. */
export async function currentAdmin(): Promise<AdminUserRow | null> {
  const store = await cookies();
  const sessionId = store.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  const session = await q1<{ admin_user_id: string }>(
    `SELECT admin_user_id FROM admin_sessions
      WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [sessionId]
  );
  if (!session) return null;
  return q1<AdminUserRow>(`SELECT * FROM admin_users WHERE id = $1`, [
    session.admin_user_id,
  ]);
}

export async function revokeCurrentSession(): Promise<void> {
  const store = await cookies();
  const sessionId = store.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    await q(`UPDATE admin_sessions SET revoked_at = now() WHERE id = $1`, [
      sessionId,
    ]);
  }
}

export function userTotpSecret(user: AdminUserRow): string | null {
  if (!user.totp_secret_enc) return null;
  return decryptSecret(user.totp_secret_enc);
}

// ---------------------------------------------------------------------------
// Sign-in rate limiting (§2.4): 5 failures -> 15-minute lock. In-process map
// is sufficient for a single-operator, single-instance admin; the lock state
// is advisory defense, the audit log is the record.
// ---------------------------------------------------------------------------

const attempts = new Map<string, { fails: number; lockedUntil: number }>();

export function loginLocked(username: string): boolean {
  const rec = attempts.get(username);
  return !!rec && rec.lockedUntil > Date.now();
}

export function recordLoginFailure(username: string): void {
  const rec = attempts.get(username) ?? { fails: 0, lockedUntil: 0 };
  rec.fails += 1;
  if (rec.fails >= 5) {
    rec.lockedUntil = Date.now() + 15 * 60 * 1000;
    rec.fails = 0;
  }
  attempts.set(username, rec);
}

export function recordLoginSuccess(username: string): void {
  attempts.delete(username);
}

/** Guard for admin API route handlers. Returns the admin or a 401 Response. */
export async function requireAdmin(): Promise<
  { ok: true; user: AdminUserRow } | { ok: false; response: Response }
> {
  const user = await currentAdmin();
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, user };
}

/** ADMIN_READ_ONLY=1 break-glass (§7.4): mutations refuse, reads run. */
export function readOnlyGuard(): Response | null {
  if (process.env.ADMIN_READ_ONLY === "1") {
    return Response.json(
      { error: "admin is in read-only mode (ADMIN_READ_ONLY=1)" },
      { status: 503 }
    );
  }
  return null;
}

export { audit };
