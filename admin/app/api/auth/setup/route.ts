import { randomBytes } from "crypto";
import * as argon2 from "argon2";
import { readOnlyGuard } from "@/lib/auth";
import { audit, db, q1 } from "@/lib/db";
import { encryptSecret, hashCode } from "@/lib/secrets";
import { generateTotpSecret } from "@/lib/totp";

// First-run setup (§2.4 bootstrap): while admin_users is EMPTY — and
// only then — this route creates the first admin from the browser, so a
// fresh deploy needs no shell access. The moment any admin exists, POST
// is a permanent 404 and GET reports setupAvailable: false.
// scripts/create-admin.mjs remains the CLI path and creates the account
// identically: argon2id password hash, TOTP secret AES-256-GCM-encrypted
// at rest, 10 hashed one-time recovery codes. The plaintext TOTP secret
// and recovery codes are returned exactly once, in the POST response
// below — they are never stored in plaintext, never logged, and no
// endpoint can return them again.

const SETUP_LOCK_KEY = 727001; // advisory lock serializing first-admin creation

// POST throttling, same spirit as the sign-in lock in lib/auth.ts
// (in-process, advisory — the audit log is the record): 10 attempts per
// client IP per 15 minutes, then 429 until the window passes.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; windowStart: number }>();

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? "").trim() || "unknown";
}

function throttled(ip: string): boolean {
  const rec = attempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.windowStart > WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}

function recordAttempt(ip: string): void {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.windowStart > WINDOW_MS) {
    attempts.set(ip, { count: 1, windowStart: now });
  } else {
    rec.count += 1;
  }
}

/** Availability probe for the login page: the flag, and nothing else. */
export async function GET() {
  const row = await q1<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM admin_users`
  );
  return Response.json({ setupAvailable: Number(row?.n ?? 0) === 0 });
}

export async function POST(req: Request) {
  const ro = readOnlyGuard();
  if (ro) return ro;

  const ip = clientIp(req);
  if (throttled(ip)) {
    return Response.json(
      { error: "too many setup attempts — try again later" },
      { status: 429 }
    );
  }
  recordAttempt(ip);

  const body = (await req.json().catch(() => null)) as {
    username?: string;
    password?: string;
  } | null;
  const username = body?.username?.trim() ?? "";
  const password = body?.password ?? "";

  // One transaction under an advisory lock: the emptiness check and the
  // insert are atomic, so two racing first-run POSTs cannot both create
  // an admin.
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [SETUP_LOCK_KEY]);
    const count = Number(
      (await client.query(`SELECT COUNT(*)::text AS n FROM admin_users`))
        .rows[0].n
    );
    if (count > 0) {
      await client.query("ROLLBACK");
      return Response.json({ error: "not found" }, { status: 404 });
    }
    if (!username || username.length > 64) {
      await client.query("ROLLBACK");
      return Response.json(
        { error: "username is required" },
        { status: 400 }
      );
    }
    if (password.length < 12) {
      await client.query("ROLLBACK");
      return Response.json(
        { error: "password must be at least 12 characters" },
        { status: 400 }
      );
    }

    // Exactly the create-admin.mjs recipe.
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    const totpSecret = generateTotpSecret();
    const recoveryCodes = Array.from({ length: 10 }, () =>
      randomBytes(5).toString("hex").toUpperCase()
    );
    const recoveryHashes = recoveryCodes.map((c) => hashCode(c));
    const ins = await client.query(
      `INSERT INTO admin_users (id, username, password_hash, totp_secret_enc, recovery_code_hashes)
       VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id`,
      [
        username,
        passwordHash,
        encryptSecret(totpSecret),
        JSON.stringify(recoveryHashes),
      ]
    );
    await client.query("COMMIT");

    await audit(username, "auth.first_run_setup", "admin_users", ins.rows[0].id, null, {
      username,
    });

    // Shown once: enroll the authenticator from this response, then it
    // is gone for good.
    return Response.json({
      username,
      totpSecret,
      otpauthUri: `otpauth://totp/FabricAdmin:${encodeURIComponent(username)}?secret=${totpSecret}&issuer=FabricAdmin`,
      recoveryCodes,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
