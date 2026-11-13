import * as argon2 from "argon2";
import {
  createSession,
  loginLocked,
  recordLoginFailure,
  recordLoginSuccess,
  setSessionCookie,
  userTotpSecret,
} from "@/lib/auth";
import { audit, q1 } from "@/lib/db";
import { hashCode } from "@/lib/secrets";
import { verifyTotp } from "@/lib/totp";
import type { AdminUserRow } from "@/lib/auth";

// Sign-in (spec §2.4): password (argon2id) + TOTP, rate-limited,
// generic failure messages, audit-logged. A recovery code may stand in
// for the TOTP code once (it is consumed on use).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    username?: string;
    password?: string;
    totp?: string;
  } | null;
  const username = body?.username?.trim() ?? "";
  const fail = async (status = 401) => {
    recordLoginFailure(username || "unknown");
    if (username) {
      await audit(username, "auth.login_failed", "admin_users", username, null, null);
    }
    return Response.json(
      { error: "invalid credentials" },
      { status }
    );
  };

  if (!username || !body?.password || !body?.totp) return fail(400);
  if (loginLocked(username)) {
    return Response.json(
      { error: "too many failed attempts — try again in 15 minutes" },
      { status: 429 }
    );
  }

  const user = await q1<AdminUserRow>(
    `SELECT * FROM admin_users WHERE username = $1`,
    [username]
  );
  if (!user) return fail();

  const passwordOk = await argon2
    .verify(user.password_hash, body.password)
    .catch(() => false);
  if (!passwordOk) return fail();

  // Second factor: TOTP, or a one-time recovery code.
  const secret = userTotpSecret(user);
  let secondFactorOk = secret ? verifyTotp(secret, body.totp) : false;
  if (!secondFactorOk && body.totp) {
    const hashes: string[] = Array.isArray(user.recovery_code_hashes)
      ? user.recovery_code_hashes
      : [];
    const idx = hashes.indexOf(hashCode(body.totp.trim().toUpperCase()));
    if (idx >= 0) {
      const remaining = hashes.filter((_, i) => i !== idx);
      await (
        await import("@/lib/db")
      ).q(`UPDATE admin_users SET recovery_code_hashes = $1 WHERE id = $2`, [
        JSON.stringify(remaining),
        user.id,
      ]);
      secondFactorOk = true;
    }
  }
  if (!secondFactorOk) return fail();

  recordLoginSuccess(username);
  const sessionId = await createSession(user.id);
  await setSessionCookie(sessionId);
  await audit(username, "auth.login", "admin_users", user.id, null, null);
  return Response.json({ ok: true, username });
}
